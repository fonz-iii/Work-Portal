/* data/industry-ranking-config.js — Industry Ranking reference settings (public BSP bank names, groupings, brand colours).
   Edit when BSP adds a bank, a bank changes parent group, or BSP renames a bank:
   - subsidiaries: banks owned by a larger banking group (left out of the stand-alone view)
   - stand_alone_confirmed: banks confirmed independent (unlisted banks are treated as stand-alone and flagged)
   - aliases: old or long BSP name -> the short name used here; name_suffixes: legal endings stripped before matching
   - display_names: how a bank is written on slides. Ported from the sba-industry-ranking skill (thin-cushion rule removed per Fons). */
window.SBA_IR_CONFIG = {
  "sba_name": "STERLING BANK OF ASIA",
  "bank_count_default": 42,
  "brand": {
    "navy": "0A2A66",
    "amber": "F5A623",
    "deep_slate": "16324F",
    "canvas": "EFF1F5",
    "surface": "FFFFFF",
    "ink": "16181D",
    "slate": "5A626E",
    "muted": "8A919C",
    "rule": "D8DCE2",
    "grid": "DDE2E9",
    "baseline": "B9C0CA",
    "peer": "E4E8EE",
    "peer_dot": "C7CCD4",
    "sba_tint": "FFF6E6",
    "positive": "1F7A4D",
    "negative": "B3261E",
    "warning": "8F5300",
    "info": "2563A8",
    "mist": "C8D2E4",
    "steel": "8FA2C2",
    "font": "Arial"
  },
  "metrics": [
    {
      "key": "assets",
      "label": "Total Assets",
      "short": "Assets",
      "match": [
        "total assets"
      ]
    },
    {
      "key": "capital",
      "label": "Total Capital",
      "short": "Capital",
      "match": [
        "capital",
        "stockholder",
        "equity"
      ]
    },
    {
      "key": "deposits",
      "label": "Total Deposit Liabilities",
      "short": "Deposits",
      "match": [
        "deposit"
      ]
    },
    {
      "key": "loans",
      "label": "Total Loans and Receivables",
      "short": "Loans",
      "match": [
        "loans"
      ]
    }
  ],
  "subsidiaries": {
    "PHIL SAVINGS BANK": "Metrobank",
    "CHINA BANK SAVINGS": "China Banking Corporation",
    "CITY SAVINGS BANK": "UnionBank",
    "BDO NETWORK BANK": "BDO Unibank",
    "BPI DIRECT BANKO": "BPI",
    "LEGAZPI SAVINGS BANK": "BPI",
    "RCBC MICROBANK": "RCBC",
    "RIZAL MICROBANK": "RCBC"
  },
  "stand_alone_confirmed": [
    "1ST VALLEY BANK",
    "ALLBANK",
    "BANGKO KABAYAN",
    "BANK OF MAKATI",
    "BANK ONE SAVINGS",
    "BATAAN DEVELOPMENT BANK",
    "CARD SME BANK",
    "CENTURY SAVINGS BANK",
    "CITYSTATE SAVINGS BANK",
    "CORDILLERA SAVINGS BANK",
    "DUMAGUETE CITY DEV BANK",
    "EQUICOM SAVINGS BANK",
    "FIRST CONSOLIDATED BANK",
    "HIYAS BANKING",
    "ISLA BANK",
    "LEMERY SAVINGS & LOAN BANK",
    "LIFE SAVINGS BANK",
    "LOLC BANK PHILIPPINES",
    "LUZON DEVELOPMENT BANK",
    "MAKILING DEVELOPMENT BANK",
    "MALAYAN SAVINGS BANK",
    "NORTHPOINT DEV'T BANK",
    "PACIFIC ACE SAVINGS BANK",
    "PAMPANGA DEVELOPMENT BANK",
    "PENBANK",
    "PHIL BUSINESS BANK",
    "PHIL STAR DEVELOPMENT BANK",
    "PRODUCERS SAVINGS BANK",
    "QUEEN CITY DEVELOPMENT BANK",
    "STERLING BANK OF ASIA",
    "SUN SAVINGS BANK",
    "UCPB SAVINGS BANK",
    "UNIVERSITY SAVINGS BANK",
    "WEALTH DEVELOPMENT BANK",
    "YUANTA SAVINGS BANK PHILIPPINES"
  ],
  "name_suffixes": [
    "INC (A SAVINGS BANK)",
    "INC A SAVINGS BANK",
    "(A SAVINGS BANK) INC",
    "A SAVINGS BANK",
    "(A SAVINGS BANK)",
    "INC (A PDB) (FORMERLY: PENINSULA RB INC)",
    "INC (A PDB)",
    "(A PDB)",
    "INC A DEVELOPMENT BANK",
    "INC A PRIVATE DEVELOPMENT BANK",
    "(A PRIVATE DEVELOPMENT BANK)",
    "INC A THRIFT BANK",
    "(A THRIFT BANK) INC",
    "A THRIFT BANK INCORPORATED",
    "(A THIRFT BANK)",
    "(A THRIFT BANK)",
    "A THRIFT BANK OF RCBC",
    "A THRIFT BANK",
    "INC OR QUEENBANK",
    "CORPORATION",
    "CORP",
    "INC.",
    "INC",
    "LTD"
  ],
  "display_names": {
    "PHIL SAVINGS BANK": "Phil Savings Bank",
    "CHINA BANK SAVINGS": "China Bank Savings",
    "CITY SAVINGS BANK": "City Savings Bank",
    "PHIL BUSINESS BANK": "Phil Business Bank",
    "PHILIPPINE BUSINESS BANK": "Phil Business Bank",
    "BDO NETWORK BANK": "BDO Network Bank",
    "STERLING BANK OF ASIA": "Sterling Bank of Asia",
    "BPI DIRECT BANKO": "BPI Direct BanKo",
    "BANK OF MAKATI": "Bank of Makati",
    "PRODUCERS SAVINGS BANK": "Producers Savings Bank",
    "FIRST CONSOLIDATED BANK": "First Consolidated Bank",
    "LEGAZPI SAVINGS BANK": "Legazpi Savings Bank",
    "UCPB SAVINGS BANK": "UCPB Savings Bank",
    "BANGKO KABAYAN": "Bangko Kabayan",
    "HIYAS BANKING": "Hiyas Banking",
    "PENBANK": "Penbank",
    "QUEEN CITY DEVELOPMENT BANK": "Queen City Development Bank",
    "UNIVERSITY SAVINGS BANK": "University Savings Bank",
    "RCBC MICROBANK": "RCBC Microbank",
    "1ST VALLEY BANK": "1st Valley Bank",
    "CARD SME BANK": "CARD SME Bank",
    "ALLBANK": "AllBank",
    "CITYSTATE SAVINGS BANK": "Citystate Savings Bank"
  },
  "aliases": {
    "PHILIPPINE BUSINESS BANK": "PHIL BUSINESS BANK",
    "PHILIPPINE SAVINGS BANK": "PHIL SAVINGS BANK",
    "BDO NETWORK BANK INC": "BDO NETWORK BANK",
    "QUEEN CITY DEVELOPMENT BANK INC OR QUEENBANK": "QUEEN CITY DEVELOPMENT BANK"
  }
};
