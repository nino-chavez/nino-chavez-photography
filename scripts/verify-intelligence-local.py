#!/usr/bin/env python3
"""Prove the final analytics intelligence migration in an isolated local copy.

The source database is read-only to this helper. Its schema and fixtures are
dumped into one new, randomly named localhost database. Old intelligence
objects are removed only from that copy, then both final migrations (without
their outer transactions) and SQL assertions run inside one transaction and
ROLLBACK.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[1]
PSQL = pathlib.Path('/opt/homebrew/opt/postgresql@17/bin/psql')
PG_DUMP = pathlib.Path('/opt/homebrew/opt/postgresql@17/bin/pg_dump')
PG_RESTORE = pathlib.Path('/opt/homebrew/opt/postgresql@17/bin/pg_restore')
LOCAL_HOSTS = {'127.0.0.1', 'localhost', '::1'}
IDENTITY = 'photography-analytics-synthetic-v1'
DATABASE_PREFIX = 'analytics_intelligence_proof_'
MAX_SQL_INPUT_BYTES = 1_000_000


class ProofError(RuntimeError):
    """A safe-to-display local proof failure."""


@dataclass(frozen=True)
class Connection:
    host: str
    port: int
    user: str
    password: str
    database: str


def redact(value: str, connection: Connection) -> str:
    for secret in (connection.password,):
        if secret:
            value = value.replace(secret, '[REDACTED]')
    return re.sub(r'postgres(?:ql)?://[^\s]+', '[REDACTED_DATABASE_URL]', value)


def run(command: list[str], connection: Connection, *, input_text: str = '', timeout: int) -> subprocess.CompletedProcess[str]:
    if len(input_text.encode()) > MAX_SQL_INPUT_BYTES:
        raise ProofError('refusing oversized SQL subprocess input')
    environment = os.environ.copy()
    environment['PGPASSWORD'] = connection.password
    try:
        return subprocess.run(
            command,
            input=input_text,
            text=True,
            capture_output=True,
            timeout=timeout,
            env=environment,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise ProofError(f'local subprocess timed out after {timeout} seconds: {pathlib.Path(command[0]).name}') from error


def psql(connection: Connection, sql: str, *, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    command = [
        str(PSQL), '-X', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off',
        '-h', connection.host, '-p', str(connection.port), '-U', connection.user, '-d', connection.database,
    ]
    return run(command, connection, input_text=sql, timeout=timeout)


def require_success(result: subprocess.CompletedProcess[str], connection: Connection, label: str) -> None:
    if result.returncode:
        detail = redact((result.stderr or result.stdout).strip(), connection)
        raise ProofError(f'{label} failed: {detail[-4000:]}')


def parse_runtime(path: pathlib.Path) -> Connection:
    runtime = json.loads(path.read_text())
    value = runtime.get('DB_URL')
    if not isinstance(value, str):
        raise ProofError('runtime is missing DB_URL')
    parsed = urllib.parse.urlparse(value)
    host = parsed.hostname
    if host not in LOCAL_HOSTS or parsed.port != 55492 or parsed.path != '/postgres' or parsed.username != 'postgres':
        raise ProofError('refusing runtime that is not the expected local synthetic database')
    if not parsed.password:
        raise ProofError('runtime DB_URL has no password')
    return Connection(host, parsed.port, urllib.parse.unquote(parsed.username), urllib.parse.unquote(parsed.password), parsed.path.removeprefix('/'))


def scalar(connection: Connection, sql: str) -> str:
    command = [
        str(PSQL), '-X', '--no-psqlrc', '-Atq', '-v', 'ON_ERROR_STOP=1',
        '-h', connection.host, '-p', str(connection.port), '-U', connection.user, '-d', connection.database,
    ]
    result = run(command, connection, input_text=sql + '\n', timeout=30)
    require_success(result, connection, 'identity query')
    return result.stdout.strip()


def verify_source(connection: Connection) -> None:
    identity = scalar(connection, "SELECT identity FROM public.analytics_rehearsal_identity;")
    if identity != IDENTITY:
        raise ProofError('refusing source database without the local synthetic identity')
    database = scalar(connection, 'SELECT current_database();')
    if database != 'postgres':
        raise ProofError('refusing unexpected source database identity')


def database_name() -> str:
    name = DATABASE_PREFIX + secrets.token_hex(12)
    if not re.fullmatch(r'[a-z_][a-z0-9_]{1,62}', name):
        raise ProofError('generated disposable database name is invalid')
    return name


def with_database(connection: Connection, database: str) -> Connection:
    return Connection(connection.host, connection.port, connection.user, connection.password, database)


def create_database(connection: Connection, database: str) -> None:
    exists = scalar(connection, f"SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '{database}');")
    if exists != 'f':
        raise ProofError('refusing a pre-existing disposable database name')
    result = psql(connection, f'CREATE DATABASE {database} TEMPLATE template0;')
    require_success(result, connection, 'create disposable database')


def drop_database(connection: Connection, database: str) -> None:
    result = psql(connection, f'DROP DATABASE IF EXISTS {database};')
    require_success(result, connection, 'drop disposable database')


def dump_and_restore(source: Connection, target: Connection, directory: pathlib.Path) -> None:
    dump_path = directory / 'source.dump'
    dump_command = [
        str(PG_DUMP), '--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--schema=auth', '--schema=analytics_private', '--file', str(dump_path),
        '-h', source.host, '-p', str(source.port), '-U', source.user, '-d', source.database,
    ]
    require_success(run(dump_command, source, timeout=180), source, 'dump source schema and fixtures')
    restore_list = directory / 'restore.list'
    listed = run([str(PG_RESTORE), '--list', str(dump_path)], source, timeout=60)
    require_success(listed, source, 'list source dump contents')
    # pg_cron is cluster-bound: its worker reads jobs only from cron.database_name.
    # The application dump is limited to public and auth, but retain this guard
    # if a future schema adds an extension entry through either of those schemas.
    entries = [line for line in listed.stdout.splitlines() if 'EXTENSION pg_cron' not in line and 'EXTENSION - pg_cron' not in line]
    restore_list.write_text('\n'.join(entries) + '\n')
    require_success(psql(target, 'DROP SCHEMA public CASCADE;', timeout=30), target, 'clear empty disposable public schema')
    restore_command = [
        str(PG_RESTORE), '--no-owner', '--no-privileges', '--exit-on-error', '--use-list', str(restore_list),
        '-h', target.host, '-p', str(target.port), '-U', target.user, '-d', target.database, str(dump_path),
    ]
    require_success(run(restore_command, target, timeout=180), target, 'restore source schema and fixtures')


def remove_old_intelligence_objects(connection: Connection) -> None:
    sql = """
DO $$
DECLARE routine regprocedure;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE '%intelligence%'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', routine);
  END LOOP;
END $$;
DROP TABLE IF EXISTS public.analytics_intelligence_deliveries CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_briefs CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_jobs CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_requests CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_incidents CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_finding_lifecycle CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_outcomes CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_actions CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_schedules CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_preferences CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_snapshot_current CASCADE;
DROP TABLE IF EXISTS public.analytics_intelligence_snapshots CASCADE;
"""
    result = psql(connection, sql, timeout=60)
    require_success(result, connection, 'remove old intelligence objects from disposable database')


def strip_outer_transaction(path: pathlib.Path) -> str:
    lines = path.read_text().splitlines(keepends=True)
    begins = [index for index, line in enumerate(lines) if line.strip() == 'BEGIN;']
    commits = [index for index, line in enumerate(lines) if line.strip() == 'COMMIT;']
    if begins != [2] or commits != [len(lines) - 1]:
        raise ProofError('migration outer transaction shape changed; refusing to strip it')
    return ''.join(lines[:begins[0]] + lines[begins[0] + 1:commits[0]])


def run_transaction(target: Connection, migrations: list[pathlib.Path], assertions: pathlib.Path, directory: pathlib.Path) -> None:
    stripped_migrations: list[pathlib.Path] = []
    for index, migration in enumerate(migrations, start=1):
        stripped = directory / f'migration-{index}-without-outer-transaction.sql'
        stripped.write_text(strip_outer_transaction(migration))
        stripped_migrations.append(stripped)
    proof = directory / 'proof.sql'
    proof.write_text(
        'BEGIN;\n'
        + ''.join(f"\\i '{migration}'\n" for migration in stripped_migrations)
        + f"\\i '{assertions}'\n"
        + 'ROLLBACK;\n'
    )
    result = run(
        [
            str(PSQL), '-X', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off',
            '-h', target.host, '-p', str(target.port), '-U', target.user, '-d', target.database, '-f', str(proof),
        ],
        target,
        timeout=120,
    )
    require_success(result, target, 'migration and functional assertions')


def write_receipt(path: pathlib.Path, receipt: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n')


def main() -> int:
    parser = argparse.ArgumentParser(description='Run the isolated local analytics intelligence SQL proof.')
    parser.add_argument('--runtime', required=True, type=pathlib.Path, help='Local synthetic runtime JSON; never printed.')
    parser.add_argument('--receipt', type=pathlib.Path, default=ROOT / 'docs/implementation/analytics-intelligence-20260930/evidence/sql-local-proof.json')
    arguments = parser.parse_args()
    migrations = [
        ROOT / 'supabase/migrations/20260930040614_analytics_intelligence_storage.sql',
        ROOT / 'supabase/migrations/20260930062000_analytics_intelligence_private_controls.sql',
        ROOT / 'supabase/migrations/20260930084000_analytics_intelligence_refresh_health.sql',
    ]
    assertions = ROOT / 'supabase/rehearsal/analytics-intelligence-assertions.sql'
    receipt_path = arguments.receipt.resolve()
    if not receipt_path.is_relative_to(ROOT):
        raise ProofError('receipt must remain inside this repository')
    if not PSQL.is_file() or not PG_DUMP.is_file() or not PG_RESTORE.is_file():
        raise ProofError('PostgreSQL 17 client tools are required at /opt/homebrew/opt/postgresql@17/bin')

    source = parse_runtime(arguments.runtime.resolve())
    receipt: dict[str, object] = {
        'proof': 'analytics-intelligence-local-sql',
        'ranAt': datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        'source': {
            'syntheticIdentity': IDENTITY,
            'loopbackRuntime': True,
            'schemaAndFixturesDumped': False,
        },
        'migrations': [str(migration.relative_to(ROOT)) for migration in migrations],
        'assertions': str(assertions.relative_to(ROOT)),
        'outerMigrationTransactionRemoved': True,
        'rolledBack': False,
        'passed': False,
        'disposableDatabase': {'prefix': DATABASE_PREFIX, 'created': False, 'droppedAfterSuccess': False},
    }
    database: str | None = None
    temp_directory: pathlib.Path | None = None
    try:
        verify_source(source)
        database = database_name()
        create_database(source, database)
        receipt['disposableDatabase'] = {'prefix': DATABASE_PREFIX, 'created': True, 'droppedAfterSuccess': False}
        target = with_database(source, database)
        temp_directory = pathlib.Path(tempfile.mkdtemp(prefix='analytics-intelligence-proof-'))
        dump_and_restore(source, target, temp_directory)
        receipt['source'] = {'syntheticIdentity': IDENTITY, 'loopbackRuntime': True, 'schemaAndFixturesDumped': True}
        if scalar(target, "SELECT identity FROM public.analytics_rehearsal_identity;") != IDENTITY:
            raise ProofError('restored database lost the local synthetic identity')
        remove_old_intelligence_objects(target)
        run_transaction(target, migrations, assertions, temp_directory)
        receipt['rolledBack'] = True
        drop_database(source, database)
        receipt['disposableDatabase'] = {'prefix': DATABASE_PREFIX, 'created': True, 'droppedAfterSuccess': True}
        receipt['passed'] = True
        write_receipt(receipt_path, receipt)
        print(json.dumps({'passed': True, 'rolledBack': True, 'localSyntheticSchemaAndFixtures': True, 'disposableDatabaseDropped': True}))
        return 0
    except Exception as error:
        receipt['error'] = redact(str(error), source)
        receipt['disposableDatabase'] = {
            'prefix': DATABASE_PREFIX,
            'created': database is not None,
            'droppedAfterSuccess': False,
            'preservedForInspection': database is not None,
        }
        write_receipt(receipt_path, receipt)
        print(json.dumps({'passed': False, 'rolledBack': False, 'preservedDisposableDatabase': database is not None}), file=sys.stderr)
        print(receipt['error'], file=sys.stderr)
        return 1
    finally:
        if temp_directory is not None:
            shutil.rmtree(temp_directory, ignore_errors=True)


if __name__ == '__main__':
    raise SystemExit(main())
