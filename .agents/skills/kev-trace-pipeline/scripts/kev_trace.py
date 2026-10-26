#!/usr/bin/env python3
"""Local trace-to-Kev data utilities. Python standard library; no tool execution."""
from __future__ import annotations
import argparse
import copy
import json
from pathlib import Path
from collections import Counter
from trace_adapter import parse_trace, audit_summary, extract, strict_loads, stable, VERSION
from dataset import compile_records, split_records, audit_partitions

def read_jsonl(path):
    result=[]
    for line,s in enumerate(Path(path).read_text(encoding='utf-8-sig').splitlines(),1):
        if s.strip():
            try: result.append(strict_loads(s))
            except ValueError as exc: raise ValueError(f'{path}:{line}: {exc}') from exc
    return result

def write_json(path,value):
    Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')

def write_jsonl(path,values):
    Path(path).write_text(''.join(stable(v)+'\n' for v in values),encoding='utf-8')

def stage_status(out,stage,status,reason_codes=(),next_allowed_stage=None):
    """Report this stage's gate, separately from the existing evidence schemas.

    A completed stage is not a training or deployment approval. Review stages
    name the next safe check; a blocked stage never authorizes a later stage.
    """
    write_json(out/'stage-status.json',{
        'stage':stage,'status':status,'reason_codes':sorted(set(reason_codes)),
        'next_allowed_stage':None if status=='blocked' else next_allowed_stage,
    })
    return 2 if status=='blocked' else 0

def new_dir(path,inputs=()):
    out=Path(path).resolve()
    for p in inputs:
        if out==Path(p).resolve(): raise ValueError('Output must not replace input')
    if out.exists() and any(out.iterdir()): raise ValueError('Use a new or empty output directory: '+str(out))
    out.mkdir(parents=True,exist_ok=True)
    return out

def usage_report(audits):
    totals=Counter();observed=[]
    for a in audits:
        for s in a['snapshots']:
            u=s['usage']
            for k in ['inputTokens','outputTokens','cacheReadTokens','totalTokens']:
                if type(u.get(k)) is int: totals[k]+=u[k]
            observed.append({'session_id':s['session_id'],'line':s['decision_line'],'step':s['step'],'usage':u})
    return {'sum_of_recorded_fields':dict(totals),'per_model_response':observed,
        'interpretation':'Canonical assistant.data.usage only; stream copies excluded. Provider-specific semantics, not an invoice or estimated savings.'}

def discover(audit,profile):
    records,blocked=extract(audit,profile)
    return [{'sample_id':r['sample_id'],'decision_site_id':r['decision_site_id'],
        'line':r['provenance']['decision_line'],'seq':r['provenance']['decision_seq'],
        'turn':r['provenance']['turn'],'step':r['provenance']['step'],
        'implementation_recommendation':r['implementation'],
        'candidate_count':len(r['question']['criteria']),
        'observed_candidate':r['observed_candidate'],
        'label_status':r['label']['status'],
        'question':r['question']['instructions'],
        'next_evidence_needed':['Confirm runtime trigger and business contract','Verify target independently of observed action','Measure actual avoidable full-path cost'],
        'rule_suggestion_for_review':r['review']['rule_suggestion']} for r in records],blocked

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    sub=ap.add_subparsers(dest='command',required=True)
    for name in ['audit','discover','extract']:
        p=sub.add_parser(name)
        p.add_argument('traces',nargs='+')
        p.add_argument('--out',required=True)
        if name!='audit': p.add_argument('--profile',choices=['next-operation','inspection-v1'],default='next-operation')
    p=sub.add_parser('annotate')
    p.add_argument('--samples',required=True);p.add_argument('--annotations',required=True);p.add_argument('--out',required=True)
    p=sub.add_parser('compile')
    p.add_argument('--input',nargs='+',required=True);p.add_argument('--out',required=True)
    p.add_argument('--allow-weak-train',action='store_true');p.add_argument('--include-code',action='store_true')
    p=sub.add_parser('split')
    p.add_argument('--input',required=True);p.add_argument('--out',required=True);p.add_argument('--seed',type=int,default=20261026)
    p.add_argument('--fractions',default='0.7,0.1,0.1,0.1',help='train,development,calibration,test; size/coverage still require review')
    p=sub.add_parser('audit-dataset');p.add_argument('--dataset-dir',required=True);p.add_argument('--out',required=True)
    args=ap.parse_args()
    if args.command in ['audit','discover','extract']: inputs=args.traces
    elif args.command=='annotate': inputs=[args.samples,args.annotations]
    elif args.command=='compile': inputs=args.input
    elif args.command=='split': inputs=[args.input]
    else: inputs=[args.dataset_dir]
    out=new_dir(args.out,inputs)
    try:
        return execute_command(args,out)
    except (ValueError,KeyError,TypeError,OSError) as exc:
        # Preserve any partial evidence; never replace an existing output dir.
        # An unwritable destination cannot itself receive a status artifact.
        try:
            stage_status(out,args.command,'blocked',[
                'io_error' if isinstance(exc,OSError) else 'invalid_input',
            ])
        except OSError:
            pass
        raise

def execute_command(args,out):
    if args.command in ['audit','discover','extract']:
        audits=[parse_trace(p) for p in args.traces]
        audit_errors=[i['code'] for a in audits for i in a['issues'] if i['severity']=='error']
        write_json(out/'trace-audit.json',{'adapter_version':VERSION,'traces':[audit_summary(a) for a in audits]})
        write_json(out/'usage.json',usage_report(audits))
        if args.command=='audit':
            write_jsonl(out/'request-snapshots.jsonl',[s for a in audits for s in a['snapshots']])
            result={'traces':len(audits),'boundaries':sum(len(a['snapshots']) for a in audits),
                'errors':sum(i['severity']=='error' for a in audits for i in a['issues'])}
        elif args.command=='discover':
            found=[];blocked=[]
            for a in audits:
                r,b=discover(a,args.profile);found.extend(r);blocked.extend(b)
            write_json(out/'decision-inventory.json',{'profile':args.profile,'candidates':found,'blocked':blocked,
                'status':'proposals_not_validated_runtime_contracts'})
            result={'decision_candidates':len(found),'blocked':len(blocked),'status':'requires_contract_review'}
        else:
            records=[];blocked=[]
            for a in audits:
                r,b=extract(a,args.profile);records.extend(r);blocked.extend(b)
            ids=[r['sample_id'] for r in records]
            if len(ids)!=len(set(ids)): raise ValueError('Duplicate decision sample IDs across inputs; deduplicate source exports first')
            write_jsonl(out/'samples.jsonl',records)
            write_jsonl(out/'annotations.todo.jsonl',[{'sample_id':r['sample_id'],'label':copy.deepcopy(r['label'])} for r in records])
            result={'profile':args.profile,'samples':len(records),'blocked':blocked,
                'source_groups':len({r['provenance']['source_group_id'] for r in records}),
                'implementation_counts':dict(Counter(r['implementation'] for r in records)),
                'label_counts':dict(Counter(r['label']['status'] for r in records)),
                'token_budget':'not_checked','ready_for_training':False,
                'note':'Observed actions and rule suggestions are evidence, not automatically verified labels.'}
            write_json(out/'extraction-report.json',result)
        print(json.dumps({'out':str(out),**result},ensure_ascii=False))
        if audit_errors:
            return stage_status(out,args.command,'blocked',['trace_audit_errors',*audit_errors])
        if args.command=='audit':
            if not result['boundaries']:
                return stage_status(out,args.command,'requires_review',['no_decision_boundaries'])
            return stage_status(out,args.command,'completed',next_allowed_stage='discover')
        if args.command=='discover':
            reasons=['decision_contract_review_required',*[b['reason'] for b in blocked]]
            if not found: reasons.append('no_decision_candidates')
            return stage_status(out,args.command,'requires_review',reasons,'contract-review')
        if not records or blocked:
            reasons=[b['reason'] for b in blocked]
            if blocked: reasons.append('blocked_decision_prefixes')
            if not records: reasons.append('no_usable_samples')
            return stage_status(out,args.command,'blocked',reasons)
        return stage_status(out,args.command,'requires_review',
            ['label_review_required','runtime_contract_review_required'],'annotate')
    if args.command=='annotate':
        records=read_jsonl(args.samples);annotations=read_jsonl(args.annotations)
        ids={r['sample_id'] for r in records};by_id={}
        if len(ids)!=len(records): raise ValueError('Duplicate sample IDs')
        for a in annotations:
            if set(a)!={'sample_id','label'}: raise ValueError('Annotation may only contain sample_id and label')
            sid=a['sample_id']
            if sid not in ids or sid in by_id: raise ValueError('Unknown or duplicate annotation ID: '+sid)
            label=a['label']
            if not isinstance(label,dict) or label.get('status') not in ['unlabeled','weak','verified','ambiguous','invalid']:
                raise ValueError('Explicit supported label.status required')
            if label.get('status') in ['weak','verified'] and (not label.get('source') or not label.get('evidence_refs')):
                raise ValueError('Label source and evidence references required')
            by_id[sid]=label
        for r in records:
            if r['sample_id'] in by_id:
                label=by_id[r['sample_id']]
                if label.get('value') is not None and label['value'] not in r['question']['criteria']:
                    raise ValueError('Annotation target not in current candidates: '+r['sample_id'])
                r['label']=copy.deepcopy(label)
        write_jsonl(out/'samples.labeled.jsonl',records)
        write_json(out/'annotation-report.json',{'updates':len(by_id),'labels':dict(Counter(r['label']['status'] for r in records)),
            'semantic_validation':'Source/evidence structure checked; reviewer remains responsible for target correctness.'})
        print(json.dumps({'out':str(out),'updates':len(by_id)},ensure_ascii=False))
        eligible,_,_=compile_records(records)
        reasons=['label_semantics_not_verified']
        if not eligible: reasons.append('no_default_export_eligible_labels')
        return stage_status(out,args.command,'requires_review',reasons,'compile' if eligible else 'annotate')
    if args.command=='compile':
        records=[r for p in args.input for r in read_jsonl(p)]
        compiled,quarantine,report=compile_records(records,args.allow_weak_train,include_code=args.include_code)
        write_jsonl(out/'compiled.jsonl',compiled);write_jsonl(out/'quarantine.jsonl',quarantine);write_json(out/'compile-report.json',report)
        print(json.dumps({'out':str(out),'compiled':len(compiled),'quarantine':len(quarantine),'report':report},ensure_ascii=False))
        reasons=list(report['quarantine_by_reason'])
        if not compiled or report['status']=='blocked':
            return stage_status(out,args.command,'blocked',['no_compiled_records',*reasons])
        return stage_status(out,args.command,'requires_review' if quarantine else 'completed',reasons,'split')
    if args.command=='split':
        values=[float(x) for x in args.fractions.split(',')]
        if len(values)!=4: raise ValueError('Four fractions required')
        fractions=dict(zip(['train','development','calibration','test'],values))
        partitions,manifest=split_records(read_jsonl(args.input),fractions,seed=args.seed)
        write_json(out/'split-manifest.json',manifest)
        ready=manifest.get('status')=='ready' and manifest.get('audit',{}).get('ok') is True
        if ready:
            for name,records in partitions.items(): write_jsonl(out/(name+'.jsonl'),records)
            write_json(out/'partition-audit.json',audit_partitions(partitions))
        print(json.dumps({'out':str(out),'manifest':manifest},ensure_ascii=False))
        if not ready:
            return stage_status(out,args.command,'blocked',manifest.get('blocked_reasons') or ['partition_audit_failed'])
        reasons=['missing_label_coverage'] if manifest.get('missing_label_coverage') else []
        return stage_status(out,args.command,'requires_review' if reasons else 'completed',reasons,'audit-dataset')
    if args.command=='audit-dataset':
        source=Path(args.dataset_dir)
        expected=['train','development','calibration','test']
        missing=[name for name in expected if not (source/(name+'.jsonl')).is_file()]
        if missing: raise ValueError('Missing independent dataset partitions: '+','.join(missing))
        parts={name:read_jsonl(source/(name+'.jsonl')) for name in expected}
        report=audit_partitions(parts)
        report['training_handoff']={'token_budget':'not_checked','runtime_equivalence':'not_evaluated',
            'required_next':['Run the selected Kev renderer/tokenizer and length checks','Check source diversity and business slice coverage','Compare cheap baseline, original Harness and Kev Variant on independent tasks'],
            'augmentation_first_run':{'keep_choice_shuffle':True,'p_none':0,'p_none_distract':0,'p_distract':0,'p_none_pair':0},
            'augmentation_scope':'Fixed closed-set baseline recommendation; ablate for dynamic candidates, not a universal Kev default.'}
        write_json(out/'dataset-audit.json',report);print(json.dumps({'out':str(out),'report':report},ensure_ascii=False))
        if report.get('ok') is not True:
            return stage_status(out,args.command,'blocked',
                [e['code'] for e in report['errors']] or ['no_dataset_records'])
        return stage_status(out,args.command,'requires_review',
            ['token_budget_not_checked','runtime_equivalence_not_evaluated'],'encoding-review')

if __name__=='__main__':
    try: raise SystemExit(main())
    except (ValueError,KeyError,TypeError,OSError) as exc:
        raise SystemExit('ERROR: '+str(exc))
