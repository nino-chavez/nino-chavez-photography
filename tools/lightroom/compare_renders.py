#!/usr/bin/env python3
"""Compare the four private Lightroom probe exports; requires Pillow and NumPy."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw, ImageOps

HDR_NS = '{http://ns.adobe.com/hdr-gain-map/1.0/}'


def read_image(path):
    raw = path.read_bytes()
    image = Image.open(io.BytesIO(raw))
    gain = None
    mp = image._getmp() if hasattr(image, '_getmp') else None
    if mp and len(mp.get(45058, [])) > 1:
        entry = mp[45058][1]
        offset = entry['DataOffset'] + image.info['mpoffset']
        gain = np.array(Image.open(io.BytesIO(raw[offset:offset + entry['Size']])).convert('RGB'))
    metadata = []
    for packet in re.findall(rb'<x:xmpmeta\b.*?</x:xmpmeta>', raw, re.S):
        root = ET.fromstring(packet)
        fields = {}
        for element in root.iter():
            for key, value in element.attrib.items():
                if key.startswith(HDR_NS):
                    fields[key[len(HDR_NS):]] = value
            if element.tag.startswith(HDR_NS):
                fields[element.tag[len(HDR_NS):]] = ' '.join(' '.join(element.itertext()).split())
        if fields:
            metadata.append(fields)
    return {
        'rgb': np.array(image.convert('RGB')),
        'icc_sha256': hashlib.sha256(image.info.get('icc_profile', b'')).hexdigest(),
        'gain': gain,
        'gain_metadata': metadata,
    }


def distance(left, right):
    if left is None or right is None:
        return {'both_absent': left is None and right is None}
    if left.shape != right.shape:
        return {'same_dimensions': False, 'left_shape': list(left.shape), 'right_shape': list(right.shape)}
    delta = np.abs(left.astype(np.int16) - right.astype(np.int16))
    return {
        'same_dimensions': True,
        'identical_pixels': bool(not delta.any()),
        'mae_0_to_255': float(delta.mean()),
        'p99_0_to_255': float(np.percentile(delta, 99)),
        'max_0_to_255': int(delta.max()),
    }


def compare(left, right):
    return {
        'base': distance(left['rgb'], right['rgb']),
        'same_icc': left['icc_sha256'] == right['icc_sha256'],
        'gain_map': distance(left['gain'], right['gain']),
        'same_gain_metadata': left['gain_metadata'] == right['gain_metadata'],
        'left_gain_metadata': left['gain_metadata'],
        'right_gain_metadata': right['gain_metadata'],
    }


def image_paths(folder):
    return {p.stem: p for p in folder.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', type=Path)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--output', type=Path, help='Defaults to job/verification; must not already exist.')
    args = parser.parse_args()
    output = args.output or args.job / 'verification'
    folders = {stage: image_paths(args.job / stage) for stage in ('baseline', 'reapplied', 'exposure-plus-0.25', 'restored')}
    folders['reference'] = image_paths(args.reference)
    names = sorted(folders['baseline'])
    if not 1 <= len(names) <= 5 or any(set(paths) != set(names) for paths in folders.values()):
        raise SystemExit('Incomplete or mismatched render sets; no comparison written.')
    output.mkdir(parents=True, exist_ok=False)
    report = {
        'job': str(args.job.resolve()), 'reference': str(args.reference.resolve()),
        'scope': 'Stored 2048-pixel SDR base RGB and embedded HDR gain map. Not HDR monitor or full-resolution acceptance.',
        'photos': {},
    }
    for name in names:
        images = {stage: read_image(paths[name]) for stage, paths in folders.items()}
        report['photos'][name] = {
            'reference_to_baseline': compare(images['reference'], images['baseline']),
            **{f'baseline_to_{stage}': compare(images['baseline'], images[stage]) for stage in ('reapplied', 'exposure-plus-0.25', 'restored')},
        }
    # This sheet intentionally shows the SDR base, not an HDR display simulation.
    stages = ('reference', 'baseline', 'exposure-plus-0.25', 'restored')
    width, height = 250, 330
    sheet = Image.new('RGB', (width * len(names), height * len(stages) + 34), '#202020')
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 8), 'SDR base comparison - full HDR display appearance is not shown', fill='white')
    for row, stage in enumerate(stages):
        for column, name in enumerate(names):
            x, y = column * width, row * height + 34
            with Image.open(folders[stage][name]) as image:
                thumb = ImageOps.contain(image.convert('RGB'), (width - 12, height - 44))
                sheet.paste(thumb, (x + (width - thumb.width) // 2, y + 36 + (height - 44 - thumb.height) // 2))
            draw.text((x + 6, y + 4), f'{name}\n{stage}', fill='white')
    sheet.save(output / 'comparison.jpg', quality=94)
    (output / 'metrics.json').write_text(json.dumps(report, indent=2) + '\n')
    for name, metrics in report['photos'].items():
        print(name, {stage: result['base'].get('mae_0_to_255') for stage, result in metrics.items()})
    print('Evidence:', output)


if __name__ == '__main__':
    main()
