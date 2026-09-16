"""Historical HSK mappings for continuous logical export series.

Only mappings with an identified predecessor are listed here.  Unlisted logical
codes continue to query the same HS code for all periods.

`quality` documents comparability of the old classification:
- exact_merge: predecessor codes combine into the current logical series.
- legacy_proxy: the predecessor bucket is broader than the current logical code.
- item_proxy: mapping follows the configured item concept rather than the full
  scope of the current 6-digit heading.
"""

from customs_common import month_range, next_month


HS_HISTORY = {
    # HSK 2022 merged photovoltaic cells/modules into 8541430000.
    '8541430000': ({
        'start': '202001', 'end': '202112',
        'sources': ('8541409021', '8541409022'),
        'quality': 'exact_merge',
        'note': '2020-2021 solar cells + modules; merged into 8541430000 from 2022',
    },),
    # Before 2022, the current NCM line was contained in broader 2841909000.
    '2841909020': ({
        'start': '202001', 'end': '202112',
        'sources': ('2841909000',),
        'quality': 'legacy_proxy',
        'note': 'pre-2022 broader lithium metal-oxide salt bucket; not NCM-only',
    },),
    # The repository labels both current series as toxin.  Before HSK 2022,
    # toxin was split into saxitoxin, ricin and other toxin subcodes.
    '3002491000': ({
        'start': '202001', 'end': '202112',
        'sources': ('3002903010', '3002903020', '3002903090'),
        'quality': 'exact_merge',
        'note': 'pre-2022 toxin subcodes: saxitoxin + ricin + other toxin',
    },),
    '300249': ({
        'start': '202001', 'end': '202112',
        'sources': ('3002903010', '3002903020', '3002903090'),
        'quality': 'item_proxy',
        'note': 'configured item is toxin; historical series uses old toxin subcodes only',
    },),
}


def history_rule(logical_hs, month):
    """Return the historical rule for one YYYYMM month, or None."""
    for rule in HS_HISTORY.get(logical_hs, ()):
        if rule['start'] <= month <= rule['end']:
            return rule
    return None


def source_codes(logical_hs, month):
    """Return source HSK code(s) that represent the logical series in YYYYMM."""
    rule = history_rule(logical_hs, month)
    return tuple(rule['sources']) if rule else (logical_hs,)


def source_quality(logical_hs, month):
    rule = history_rule(logical_hs, month)
    return rule['quality'] if rule else 'current'


def split_source_ranges(logical_hs, start, end):
    """Split a YYYYMM range whenever the source-code set changes."""
    groups = []
    for month in month_range(start, end):
        sources = source_codes(logical_hs, month)
        quality = source_quality(logical_hs, month)
        if (groups and next_month(groups[-1][1]) == month
                and groups[-1][2] == sources and groups[-1][3] == quality):
            groups[-1] = (groups[-1][0], month, sources, quality)
        else:
            groups.append((month, month, sources, quality))
    return groups
