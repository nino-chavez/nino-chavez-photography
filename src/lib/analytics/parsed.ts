/** What a form parser returns: the cleaned fields, or one plain sentence saying what to fix. */
export type Parsed<T> = ({ ok: true } & T) | { ok: false; error: string };
