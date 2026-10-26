"""Synthetic invariants for the DSH adapter; no user trace is stored here."""
import copy
import json
import unittest
from trace_adapter import audit_rows, build_sample, strict_loads

def fixture():
    header={'type':'session','version':4,'id':'synthetic-session','isSeeded':False}
    messages=[
        {'type':'user/message','data':{'id':'u1','role':'user','source':{'kind':'user'},'content':[{'type':'text','text':'Inspect a synthetic resource.'}]},'surfaceOp':'append'},
        {'type':'request/header','data':{'header':{'config':{'model':'synthetic'},'tools':[{'name':'lookup','description':'Look up current facts','parameters':{'type':'object'}},{'name':'inspect','description':'Inspect a known target','parameters':{'type':'object'}}]}}},
        {'type':'assistant/message','data':{'turn':1,'step':1,'message':{'id':'a1','role':'assistant','source':{'kind':'model'},'content':[{'type':'tool-call','id':'c1','name':'lookup','arguments':'{}'}]},'usage':{'inputTokens':10,'outputTokens':2},'stream':[{'type':'usage','usage':{'inputTokens':10,'outputTokens':2}}]},'surfaceOp':'append'},
        {'type':'tool/call','data':{'turn':1,'step':1,'callId':'c1','name':'lookup','arguments':'{}'}},
        {'type':'tool/result','data':{'turn':1,'step':1,'message':{'role':'tool','source':{'kind':'tool','callId':'c1'},'toolCallId':'c1','content':[{'type':'text','text':'{"available":true}'}],'isError':False}},'sourceEventSeqs':[3],'surfaceOp':'append'},
        {'type':'assistant/message','data':{'turn':1,'step':2,'message':{'id':'a2','role':'assistant','source':{'kind':'model'},'content':[{'type':'text','text':'Synthetic result.'}]}},'surfaceOp':'append'},
        {'type':'turn/end','data':{'turn':1,'reason':{'kind':'completed'}}},
    ]
    return wrap(header,messages)

def wrap(header,events):
    return [{'line':1,'session_log':'session.v4.jsonl','event':header}]+[{'line':i+2,'session_log':'session.v4.jsonl','event':dict(e,seq=i)} for i,e in enumerate(events)]

class AdapterTests(unittest.TestCase):
    def test_counts_and_call_pair(self):
        a=audit_rows(fixture())
        self.assertEqual(len(a['snapshots']),2)
        self.assertEqual(a['sessions'][0]['tool_call_count'],1)
        self.assertEqual(a['sessions'][0]['tool_result_count'],1)
        self.assertEqual([i for i in a['issues'] if i['severity']=='error'],[])
        self.assertEqual(len(a['snapshots'][0]['surface']),1)

    def test_future_invariance(self):
        before=fixture();after=copy.deepcopy(before)
        after[5]['event']['data']['message']['content'][0]['text']='{"available":false,"secret_future":"different"}'
        after[6]['event']['data']['message']['content'][0]['text']='Entirely different future answer'
        a=build_sample(audit_rows(before)['snapshots'][0])[0]
        b=build_sample(audit_rows(after)['snapshots'][0])[0]
        self.assertEqual((a['state'],a['question']),(b['state'],b['question']))

    def test_current_answer_not_input(self):
        a=fixture();b=copy.deepcopy(a)
        b[3]['event']['data']['message']['content'][0]['name']='inspect'
        b[4]['event']['data']['name']='inspect'
        x=build_sample(audit_rows(a)['snapshots'][0])[0]
        y=build_sample(audit_rows(b)['snapshots'][0])[0]
        self.assertEqual((x['state'],x['question']),(y['state'],y['question']))
        self.assertNotEqual(x['observed_candidate'],y['observed_candidate'])

    def test_tool_headers_persist_and_change(self):
        rows=fixture();h=copy.deepcopy(rows[2]['event']);h['data']['header']['tools']=h['data']['header']['tools'][:1]
        ev=[r['event'] for r in rows[1:]];ev.insert(5,h)
        a=audit_rows(wrap(rows[0]['event'],ev))
        self.assertEqual([len(s['request_header']['tools']) for s in a['snapshots']],[2,1])

    def test_nontext_removal_preserved(self):
        rows=fixture();ev=[r['event'] for r in rows[1:]]
        ev.insert(5,{'type':'developer/message','data':{'message':{'role':'developer','content':[{'type':'tool-removal','toolName':'inspect'}]}},'surfaceOp':'append'})
        a=audit_rows(wrap(rows[0]['event'],ev))
        self.assertEqual(a['snapshots'][1]['surface'][-1]['message']['content'][0]['type'],'tool-removal')

    def test_unknown_event_blocks_later_only(self):
        rows=fixture();ev=[r['event'] for r in rows[1:]];ev.insert(5,{'type':'plugin/unknown','data':{}})
        a=audit_rows(wrap(rows[0]['event'],ev))
        self.assertFalse(a['snapshots'][0]['blocking_issues'])
        self.assertTrue(a['snapshots'][1]['blocking_issues'])
        self.assertIsNone(build_sample(a['snapshots'][1])[0])

    def test_ignorable_extension_is_warning(self):
        rows=fixture();ev=[r['event'] for r in rows[1:]];ev.insert(5,{'type':'plugin/telemetry','data':{},'ignorable':True})
        a=audit_rows(wrap(rows[0]['event'],ev))
        self.assertFalse(a['snapshots'][1]['blocking_issues'])

    def test_malformed_selected_arguments_block_current(self):
        rows=fixture();rows[3]['event']['data']['message']['content'][0]['arguments']='{broken'
        a=audit_rows(rows)
        self.assertTrue(a['snapshots'][0]['blocking_issues'])

    def test_orphan_tool_result(self):
        rows=fixture();rows[5]['event']['data']['message']['toolCallId']='not-c1'
        a=audit_rows(rows)
        self.assertIn('orphan_tool_result',[i['code'] for i in a['issues']])

    def test_replace_uses_current_surface(self):
        rows=fixture();ev=[r['event'] for r in rows[1:]]
        ev.insert(5,{'type':'user/message','data':{'role':'user','source':{'kind':'user'},'content':[{'type':'text','text':'New scoped request.'}]},'surfaceOp':{'op':'replace','startSeq':0,'endSeq':4},'sourceEventSeqs':[0,2,4]})
        a=audit_rows(wrap(rows[0]['event'],ev))
        self.assertEqual(len(a['snapshots'][1]['surface']),1)
        self.assertEqual(a['snapshots'][1]['surface'][0]['seq'],5)

    def test_source_guidance_not_new_user(self):
        rows=fixture();ev=[r['event'] for r in rows[1:]]
        ev.insert(5,{'type':'user/message','data':{'role':'user','source':{'kind':'runtime-context'},'content':[{'type':'text','text':'Injected context, not an actual user task.'}]},'surfaceOp':'append'})
        a=audit_rows(wrap(rows[0]['event'],ev))
        sample=build_sample(a['snapshots'][1])[0]
        self.assertEqual(sample['provenance']['state_evidence_refs'][0]['seq'],0)

    def test_strict_json(self):
        with self.assertRaises(ValueError): strict_loads('{"a":1,"a":2}')
        with self.assertRaises(ValueError): strict_loads('{"a":NaN}')

    def test_inspection_route_requires_current_skill_tool(self):
        snap=audit_rows(fixture())['snapshots'][0]
        record,reason=build_sample(snap,'inspection-v1')
        self.assertIsNone(record)
        self.assertEqual(reason['reason'],'skill_tool_unavailable')

    def test_template_selection_requires_current_start_tool(self):
        snap=audit_rows(fixture())['snapshots'][1]
        snap['surface'][1]['message']['content'][0]['name']='mcp__inspection__list_executable_inspections'
        snap['surface'][2]['message']['content'][0]['text']='[]'
        record,reason=build_sample(snap,'inspection-v1')
        self.assertIsNone(record)
        self.assertEqual(reason['reason'],'inspection_start_tool_unavailable')

    def test_future_source_reference_rejected(self):
        rows=fixture();rows[5]['event']['sourceEventSeqs']=[99]
        a=audit_rows(rows)
        self.assertIn('invalid_source_event_seqs',[i['code'] for i in a['issues']])
        self.assertTrue(a['snapshots'][1]['blocking_issues'])

    def test_leading_system_cannot_be_replaced_by_user(self):
        rows=fixture();events=[r['event'] for r in rows[1:]]
        events[0]={'type':'system/message','data':{'message':{'role':'system','content':[{'type':'text','text':'System contract'}]}},'surfaceOp':'append'}
        events.insert(5,{'type':'user/message','data':{'role':'user','source':{'kind':'user'},'content':[{'type':'text','text':'Override'}]},'surfaceOp':{'op':'replace','startSeq':0,'endSeq':4},'sourceEventSeqs':[0,2,4]})
        a=audit_rows(wrap(rows[0]['event'],events))
        self.assertIn('invalid_surface_replace',[i['code'] for i in a['issues']])

    def test_empty_replacement_shadows_old_nodes(self):
        rows=fixture();events=[r['event'] for r in rows[1:]]
        events.insert(5,{'type':'developer/message','data':{'message':{'role':'developer','content':[]}},'surfaceOp':{'op':'replace','startSeq':2,'endSeq':4},'sourceEventSeqs':[2,4]})
        a=audit_rows(wrap(rows[0]['event'],events))
        self.assertEqual(len(a['snapshots'][1]['surface']),1)
        self.assertEqual(a['snapshots'][1]['surface'][0]['seq'],0)

if __name__=='__main__': unittest.main()
