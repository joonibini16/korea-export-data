"""Validate the public research index without making network requests."""
import json, sys
from datetime import date, datetime
from urllib.parse import urlparse, parse_qsl, urlencode

def canonical(url):
    u=urlparse(url)
    assert u.scheme=='https' and u.hostname and not u.username and not u.password, 'Invalid source URL'
    query=urlencode(sorted((k,v) for k,v in parse_qsl(u.query) if not k.lower().startswith('utm_')))
    return (u.hostname.lower(),u.path.rstrip('/'),query)

def validate(data):
    assert data['schema_version']==1
    datetime.fromisoformat(data['last_checked_at'].replace('Z','+00:00'))
    datetime.fromisoformat(data['updated_at'].replace('Z','+00:00'))
    providers={p['id'] for p in data['providers']}
    assert len(providers)==len(data['providers'])
    ids, identities=set(),set()
    for r in data['reports']:
        assert r['id'] not in ids, 'Duplicate report id'; ids.add(r['id'])
        assert r['publisher'] in providers and r['sectors'] and set(r['sectors'])<=set(data['sectors'])
        assert r['document_type'] in ['research_pdf','research_article','cio_commentary','market_commentary','podcast','media_reference']
        assert r['source_scope'] in ['full_text','official_summary','media_only','listing_only']
        assert r['stance'] in ['positive','negative','mixed','neutral','unknown']
        if r['published_at']: date.fromisoformat(r['published_at'])
        assert r['published_at'] is None or r['published_at']<=r['last_verified_at'][:10], 'Future publication'
        for k in ['first_seen_at','last_verified_at']: datetime.fromisoformat(r[k].replace('Z','+00:00'))
        for k in ['title','title_ko','headline','division','interpretation','estimate_signal','tone_change','valuation_change']: assert isinstance(r[k],str) and r[k].strip(), k
        assert isinstance(r['facts'],list) and r['facts'] and all(isinstance(v,str) and v.strip() for v in r['facts'])
        assert isinstance(r['watch'],list) and isinstance(r['companies'],list)
        for c in r['companies']: assert all(c.get(k) for k in ['ticker','name','relationship'])
        u=canonical(r['source_url']); identity=(r['publisher'],r['title'].strip().casefold(),r['published_at'],u)
        assert identity not in identities, 'Duplicate report'; identities.add(identity)
        for k in ['landing_url','prior_source']:
            if r.get(k): canonical(r[k])
    for p in data['providers']:
        assert p['status'] in ['checked','partial','failed','pending']; canonical(p['source_url'])
    assert isinstance(data['checks'],list)
    return len(ids)

if __name__=='__main__':
    path=sys.argv[1] if len(sys.argv)>1 else 'global_research.json'
    print('Validated',validate(json.load(open(path,encoding='utf-8'))),'research records')
