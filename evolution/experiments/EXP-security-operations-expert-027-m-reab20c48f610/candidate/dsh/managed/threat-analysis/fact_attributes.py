"""仅分离已知认证事实句型中的分类说明；不改证据或放宽正式校验。"""
from __future__ import annotations

from copy import deepcopy
from ipaddress import ip_address
import re
from typing import Mapping

from forced_output_contract import (
    FORBIDDEN_SOURCE_MARKERS, _BARE_ENTITY_REF,
    _is_primary_scoped_behavior, _reject_incident_or_rule_declaration,
)

_AUTH_FACT = re.compile(
    r'(?P<prefix>同一\s*EDR\s*活动片段中记录了来自\s*(?P<source_ip>[0-9A-Fa-f:.]+)\s*的认证活动)'
    r'[，,]\s*事件类型为\s*(?P<event_type>[A-Z][A-Z0-9_]*)[，,]\s*'
    r'(?P<suffix>会话\s*ID\s*为\s*(?P<session_id>\{[0-9A-Fa-f-]{36}\}|[A-Za-z0-9_-]{8,128})[。.]?)'
)


def _primary_segments(five_source):
    enriched = five_source.get('enriched_context')
    domain = enriched.get('edr_detail') if isinstance(enriched, Mapping) else None
    if not isinstance(domain, Mapping):
        return []
    found = []
    for collection in ('entities', 'assets'):
        assets = domain.get(collection)
        if not isinstance(assets, list):
            continue
        for asset_index, asset in enumerate(assets):
            segments = asset.get('activity_segments') if isinstance(asset, Mapping) else None
            if not isinstance(segments, list):
                continue
            for segment_index, segment in enumerate(segments):
                if not isinstance(segment, Mapping):
                    continue
                path = f'{collection}[{asset_index}].activity_segments[{segment_index}]'
                evidence = {'source': 'edr_detail', 'field': path + '.authentication_activities'}
                if _is_primary_scoped_behavior(evidence, five_source):
                    found.append((path, segment))
    return found


def normalize_fact_attributes(output, five_source):
    normalized = deepcopy(dict(output))
    changes = []
    facts = normalized.get('verified_facts')
    snapshot = five_source.get('event_snapshot')
    target = snapshot.get('judgement_target') if isinstance(snapshot, Mapping) else None
    if isinstance(facts, list) and isinstance(target, Mapping):
        for index, fact in enumerate(facts):
            if not isinstance(fact, dict) or fact.get('source') != 'edr_detail':
                continue
            before = fact.get('fact')
            if not isinstance(before, str) or '\n' in before or '\r' in before:
                continue
            # 整句匹配，不容许额外前后缀、命令、路径、引号或多分类子句。
            match = _AUTH_FACT.fullmatch(before)
            if match is None or _BARE_ENTITY_REF.search(before):
                continue
            if any(marker.casefold() in before.casefold() for marker in FORBIDDEN_SOURCE_MARKERS):
                continue
            values = {key: match.group(key) for key in ('event_type', 'source_ip', 'session_id')}
            try:
                ip_address(values['source_ip'])
                # 不允许靠删分类子句隐藏原始目标/规则声明。
                _reject_incident_or_rule_declaration(values['event_type'], snapshot, target, f'verified_facts[{index}].fact')
            except ValueError:
                continue
            segments = _primary_segments(five_source)
            if len(segments) != 1:
                raise ValueError(f'verified_facts[{index}].fact classification annotation has no unique primary activity segment')
            path, segment = segments[0]
            rows = segment.get('authentication_activities')
            witnesses = []
            if isinstance(rows, list):
                for row_index, row in enumerate(rows):
                    if isinstance(row, Mapping) and all(isinstance(row.get(key), str) and row[key] == value for key, value in values.items()):
                        witnesses.append('enriched_context.edr_detail.' + path + f'.authentication_activities[{row_index}]')
            if len(witnesses) != 1:
                raise ValueError(f'verified_facts[{index}].fact classification annotation has no unique same-record witness')
            after = match.group('prefix') + '，' + match.group('suffix')
            fact['fact'] = after
            changes.append({'field': f'verified_facts[{index}].fact', 'fact_id': fact.get('id'),
                            'source': 'edr_detail', 'before': before, 'after': after,
                            'source_ref': witnesses[0], 'observed_values': values})
    return normalized, {'schema_version': 1, 'status': 'normalized' if changes else 'unchanged',
                        'changed_fields': len(changes), 'changes': changes}
