// 設例（テストの事例）。画面の「設例から選ぶ」と、テスト（tests/engine.mjs）の両方がこれを読む。
// expect は計算の結果の期待値。tests/engine.mjs が、各設例を計算してこれと一致することを確かめる。
// 近藤本の参考例を基にしたものは、計算の結果が変わらないよう金額・日付はそのままにし、名前を符号に置き換えている（source に出典）。
(function (g) {
  'use strict';
  const HT = (g.HT = g.HT || {});
  HT.EXAMPLES = [
  {
    "id": "gen-basic",
    "group": "一般債権・弁済金交付・合意配当",
    "title": "一般債権3人で按分",
    "desc": "預金100万円に一般債権者3人が競合。手続費用を先に償還し、残りを債権額で按分する（端数は小数点以下の大きい者から）。",
    "ronten": [
      "1-1",
      "7-3"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-01",
            "amount": 1000000,
            "interest": 0
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "X",
          "amount": 6000
        }
      ],
      "claims": [
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-01-10",
          "principal": 1240000,
          "label": "貸金"
        },
        {
          "id": "Y",
          "creditor": "Y",
          "kind": "GEN",
          "filedOn": "2026-02-10",
          "principal": 800000,
          "label": "貸金"
        },
        {
          "id": "Z",
          "creditor": "Z",
          "kind": "GEN",
          "filedOn": "2026-03-10",
          "principal": 360000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "X": 513567,
        "Y": 331333,
        "Z": 149100
      }
    }
  },
  {
    "id": "book-xv1",
    "group": "一般債権・弁済金交付・合意配当",
    "title": "同順位の按分と充当（配当表例1）",
    "desc": "一般債権者3人。供託利息を加え、手続費用を償還した残りを按分し、費用・利息・損害金・元金の順に充当する。",
    "ronten": [
      "7-1",
      "7-3"
    ],
    "source": "近藤基「債権配当の実務と書式〔第3版〕」192頁（民事法研究会・2021年）の参考例XV-1（配当表例1）を基に、計算の結果が変わらないよう金額・日付はそのままにし、名前を符号に置き換えたもの",
    "input": {
      "meta": {
        "date": "2026-11-19",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-01-01",
            "amount": 376211,
            "interest": 87
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "A",
          "amount": 1871
        }
      ],
      "claims": [
        {
          "id": "A",
          "creditor": "A",
          "kind": "GEN",
          "filedOn": "2025-01-01",
          "cost": 6660,
          "interest": 0,
          "damages": 10977,
          "principal": 340000,
          "label": "貸金"
        },
        {
          "id": "B",
          "creditor": "B",
          "kind": "GEN",
          "filedOn": "2025-02-01",
          "cost": 3000,
          "interest": 12785,
          "damages": 58772,
          "principal": 250000,
          "label": "貸金"
        },
        {
          "id": "C",
          "creditor": "C",
          "kind": "GEN",
          "filedOn": "2025-03-01",
          "cost": 0,
          "interest": 0,
          "damages": 0,
          "principal": 455000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "A": 117754,
        "B": 106862,
        "C": 149811
      }
    }
  },
  {
    "id": "book-xv3",
    "group": "一般債権・弁済金交付・合意配当",
    "title": "債権者1人（弁済金交付計算書例1）",
    "desc": "債権者が1人なので弁済金交付計算書になる。",
    "ronten": [
      "1-1"
    ],
    "source": "近藤基「債権配当の実務と書式〔第3版〕」196頁（民事法研究会・2021年）の参考例XV-3（弁済金交付計算書例1）を基に、計算の結果が変わらないよう金額・日付はそのままにし、名前を符号に置き換えたもの",
    "input": {
      "meta": {
        "date": "2026-11-19",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-01-01",
            "amount": 508453,
            "interest": 295
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "A",
          "amount": 628
        }
      ],
      "claims": [
        {
          "id": "A",
          "creditor": "A",
          "kind": "GEN",
          "cost": 7980,
          "interest": 9857,
          "damages": 103551,
          "principal": 2000000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "弁済金交付計算書",
      "paid": {
        "A": 508120
      }
    }
  },
  {
    "id": "book-xv5",
    "group": "一般債権・弁済金交付・合意配当",
    "title": "剰余金を債務者へ（弁済金交付計算書例3）",
    "desc": "全額を弁済でき、残りは債務者に交付する。",
    "ronten": [
      "1-1"
    ],
    "source": "近藤基「債権配当の実務と書式〔第3版〕」200頁（民事法研究会・2021年）の参考例XV-5（弁済金交付計算書例3）を基に、計算の結果が変わらないよう金額・日付はそのままにし、名前を符号に置き換えたもの",
    "input": {
      "meta": {
        "date": "2026-10-10",
        "debtor": "S",
        "court": "○○地方裁判所第○民事部"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-01-01",
            "amount": 950000,
            "interest": 326
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "A",
          "amount": 628
        }
      ],
      "claims": [
        {
          "id": "A",
          "creditor": "A",
          "kind": "GEN",
          "damages": 55038,
          "principal": 725000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "弁済金交付計算書",
      "paid": {
        "A": 780038
      },
      "surplus": 169660
    }
  },
  {
    "id": "agree",
    "group": "一般債権・弁済金交付・合意配当",
    "title": "合意配当",
    "desc": "配当期日に全債権者が合意した額どおりに配る（民執法85条1項ただし書）。",
    "ronten": [
      "1-2"
    ],
    "input": {
      "meta": {
        "date": "2026-11-19",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "agreement": {
        "enabled": true,
        "amounts": {
          "A": 100000,
          "B": 100000,
          "C": 174427
        }
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-01-01",
            "amount": 376211,
            "interest": 87
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "A",
          "amount": 1871
        }
      ],
      "claims": [
        {
          "id": "A",
          "creditor": "A",
          "kind": "GEN",
          "filedOn": "2025-01-01",
          "cost": 6660,
          "damages": 10977,
          "principal": 340000,
          "label": "貸金"
        },
        {
          "id": "B",
          "creditor": "B",
          "kind": "GEN",
          "filedOn": "2025-02-01",
          "cost": 3000,
          "interest": 12785,
          "damages": 58772,
          "principal": 250000,
          "label": "貸金"
        },
        {
          "id": "C",
          "creditor": "C",
          "kind": "GEN",
          "filedOn": "2025-03-01",
          "principal": 455000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "A": 100000,
        "B": 100000,
        "C": 174427
      }
    }
  },
  {
    "id": "calc-damages",
    "group": "一般債権・弁済金交付・合意配当",
    "title": "損害金を配当期日まで日割で計算",
    "desc": "確定額の損害金に、配当期日までの損害金を日割で加える（債権者1人。弁済金交付計算書）。",
    "ronten": [
      "7-4"
    ],
    "input": {
      "meta": {
        "date": "2026-06-30",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-06-01",
            "amount": 2000000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "damages": 10000,
          "principal": 1000000,
          "calcs": [
            {
              "target": "damages",
              "base": 1000000,
              "rate": "3",
              "from": "2026-06-01"
            }
          ],
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "弁済金交付計算書",
      "paid": {
        "X": 1012465
      },
      "surplus": 987535
    }
  },
  {
    "id": "wage-lien",
    "group": "給料等と養育費（扶養義務等債権）",
    "title": "給料：養育費（先取特権あり）と一般債権",
    "desc": "手取30万円。手取額の1/4を超え1/2までの部分は養育費（扶養義務等債権）だけが差し押さえられるので養育費が取り、1/4までの部分でも、子の監護費用の先取特権の部分が一般債権に優先する。",
    "ronten": [
      "3-1",
      "3-2",
      "5-1"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-30",
            "amount": 150000,
            "interest": 0,
            "net": 300000
          }
        ]
      },
      "claims": [
        {
          "id": "W3",
          "creditor": "W",
          "kind": "SUP3",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 120000,
          "label": "養育費・先取特権"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "W3": 120000,
        "X": 30000
      }
    }
  },
  {
    "id": "wage-nolien",
    "group": "給料等と養育費（扶養義務等債権）",
    "title": "給料：養育費（先取特権なし）と一般債権",
    "desc": "手取30万円。1/4を超え1/2までの部分を養育費が取った後、1/4までの部分を、養育費の残りの額と一般債権の額で按分する（取り合いにならない部分から先に配る）。",
    "ronten": [
      "3-2",
      "3-4"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-30",
            "amount": 150000,
            "interest": 0,
            "net": 300000
          }
        ]
      },
      "claims": [
        {
          "id": "W2",
          "creditor": "W",
          "kind": "SUP2",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 120000,
          "label": "養育費"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "W2": 81193,
        "X": 68807
      }
    }
  },
  {
    "id": "wage-both",
    "group": "給料等と養育費（扶養義務等債権）",
    "title": "給料：先取特権の部分とそれ以外が並ぶ",
    "desc": "手取40万円。1本の養育費を先取特権の部分（月8万円×子の数まで）とそれ以外の2行に分けて配る。",
    "ronten": [
      "5-1",
      "3-4"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-30",
            "amount": 200000,
            "interest": 0,
            "net": 400000
          }
        ]
      },
      "claims": [
        {
          "id": "W3",
          "creditor": "W",
          "kind": "SUP3",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 160000,
          "label": "養育費・先取特権"
        },
        {
          "id": "W2",
          "creditor": "W",
          "kind": "SUP2",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 40000,
          "label": "養育費"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "W3": 160000,
        "W2": 2963,
        "X": 37037
      }
    }
  },
  {
    "id": "wage-over66",
    "group": "給料等と養育費（扶養義務等債権）",
    "title": "給料：手取66万円超",
    "desc": "手取80万円。手取額が66万円を超えると、差押禁止額が33万円で頭打ちになり、一般債権も養育費も手取額から33万円を引いた額まで差し押さえられる。そのため養育費だけが取れる部分がなくなる。",
    "ronten": [
      "3-1",
      "3-2"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-30",
            "amount": 470000,
            "interest": 0,
            "net": 800000
          }
        ]
      },
      "claims": [
        {
          "id": "W3",
          "creditor": "W",
          "kind": "SUP3",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 160000,
          "label": "養育費・先取特権"
        },
        {
          "id": "W2",
          "creditor": "W",
          "kind": "SUP2",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 40000,
          "label": "養育費"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "W3": 160000,
        "W2": 22963,
        "X": 287037
      }
    }
  },
  {
    "id": "wage-noncomp",
    "group": "給料等と養育費（扶養義務等債権）",
    "title": "給料：養育費だけが取れる部分を先に配る",
    "desc": "手取20万円。1/4を超え1/2までの5万円を先に養育費に充て、1/4までの部分を残りの額で按分する。",
    "ronten": [
      "3-4"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-30",
            "amount": 100000,
            "interest": 0,
            "net": 200000
          }
        ]
      },
      "claims": [
        {
          "id": "W2",
          "creditor": "W",
          "kind": "SUP2",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 150000,
          "label": "養育費"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 150000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "W2": 70000,
        "X": 30000
      }
    }
  },
  {
    "id": "wage-nocomp",
    "group": "給料等と養育費（扶養義務等債権）",
    "title": "給料：競合しない（弁済金交付）",
    "desc": "どの部分でも債権者の取り合いにならない（全額を払える）ので、弁済金交付計算書になる。",
    "ronten": [
      "1-1",
      "3-4"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-30",
            "amount": 90000,
            "interest": 0,
            "net": 200000
          }
        ]
      },
      "claims": [
        {
          "id": "W2",
          "creditor": "W",
          "kind": "SUP2",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 40000,
          "label": "養育費"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 100000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "弁済金交付計算書",
      "paid": {
        "W2": 40000,
        "X": 50000
      }
    }
  },
  {
    "id": "wage-d14",
    "group": "給料等と養育費（扶養義務等債権）",
    "title": "養育費だけが取れる部分の配当と先取特権の被担保債権額",
    "desc": "1/4を超え1/2までの部分（養育費だけが取れる部分）で受けた配当も、法定充当により先取特権の部分に充て、次回の配当で先取特権として優先する額が減る（初期値）。被担保債権額は変わらないとする見解（設定で切り替え）では、その部分の配当をそれ以外の部分から充てる。",
    "ronten": [
      "5-5"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-30",
            "amount": 150000,
            "interest": 0,
            "net": 300000
          }
        ]
      },
      "claims": [
        {
          "id": "W3",
          "creditor": "W",
          "kind": "SUP3",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 160000,
          "label": "養育費・先取特権"
        },
        {
          "id": "W2",
          "creditor": "W",
          "kind": "SUP2",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 40000,
          "label": "養育費"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "W3": 150000,
        "W2": 0,
        "X": 0
      }
    }
  },
  {
    "id": "mixed",
    "group": "給料等と養育費（扶養義務等債権）",
    "title": "預金と給料の両方の差押え",
    "desc": "預金の供託金は配当に加わった全員で按分し、給料の供託金だけを、1/4までの部分と1/4を超え1/2までの部分に分けて配る。",
    "ronten": [
      "3-7"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "mixed",
        "deposits": [
          {
            "id": "d1",
            "debtKind": "general",
            "date": "2026-06-01",
            "amount": 200000,
            "interest": 0
          },
          {
            "id": "d2",
            "debtKind": "wage",
            "date": "2026-07-01",
            "amount": 100000,
            "interest": 0,
            "net": 200000
          }
        ]
      },
      "claims": [
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-05-01T10:00",
          "principal": 1000000,
          "label": "貸金"
        },
        {
          "id": "W",
          "creditor": "W",
          "kind": "SUP2",
          "effectiveOn": "2026-05-01T10:00",
          "principal": 300000,
          "label": "養育費"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "X": 194139,
        "W": 105861
      }
    }
  },
  {
    "id": "sec-tax1",
    "group": "担保権・先取特権・公債権",
    "title": "抵当権（物上代位）＞租税＞一般",
    "desc": "抵当権の登記が租税の法定納期限等より前なので、抵当権が租税に優先する。",
    "ronten": [
      "4-2"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-01",
            "amount": 2000000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "M",
          "creditor": "M",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2024-05-01",
          "effectiveOn": "2026-03-01",
          "filedOn": "2026-02-20",
          "principal": 1500000,
          "label": "抵当権・物上代位"
        },
        {
          "id": "T",
          "creditor": "債権者T",
          "kind": "TAX",
          "legalDue": "2025-03-31",
          "demandAt": "2026-04-01",
          "filedOn": "2026-04-01",
          "principal": 800000,
          "label": "租税・交付要求"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2025-06-01",
          "filedOn": "2026-01-10",
          "principal": 1000000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "M": 1500000,
        "T": 500000,
        "X": 0
      }
    }
  },
  {
    "id": "sec-tax2",
    "group": "担保権・先取特権・公債権",
    "title": "租税＞抵当権（物上代位）＞一般",
    "desc": "租税の法定納期限等が抵当権の登記より前なので、租税が優先する。",
    "ronten": [
      "4-2"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-01",
            "amount": 2000000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "M",
          "creditor": "M",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2024-05-01",
          "effectiveOn": "2026-03-01",
          "filedOn": "2026-02-20",
          "principal": 1500000,
          "label": "抵当権・物上代位"
        },
        {
          "id": "T",
          "creditor": "債権者T",
          "kind": "TAX",
          "legalDue": "2024-03-31",
          "demandAt": "2026-04-01",
          "filedOn": "2026-04-01",
          "principal": 800000,
          "label": "租税・交付要求"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2025-06-01",
          "filedOn": "2026-01-10",
          "principal": 1000000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "T": 800000,
        "M": 1200000,
        "X": 0
      }
    }
  },
  {
    "id": "absorb",
    "group": "担保権・先取特権・公債権",
    "title": "抵当権の物上代位と一般債権者の差押えの先後（相対的な優劣）",
    "desc": "抵当権の登記より前に差し押さえた一般債権者には優先しないが、登記より後に差し押さえた一般債権者には優先する。いったん全員で按分し、抵当権者は、優先する相手の取り分から足りない額を受ける。",
    "ronten": [
      "4-5"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-01",
            "amount": 1000000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "M",
          "creditor": "M",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2024-05-01",
          "effectiveOn": "2026-03-01",
          "filedOn": "2026-02-20",
          "principal": 600000,
          "label": "抵当権・物上代位"
        },
        {
          "id": "A",
          "creditor": "A",
          "kind": "GEN",
          "effectiveOn": "2024-04-01",
          "filedOn": "2024-03-20",
          "principal": 400000,
          "label": "貸金"
        },
        {
          "id": "B",
          "creditor": "B",
          "kind": "GEN",
          "effectiveOn": "2025-06-01",
          "filedOn": "2025-05-20",
          "principal": 1000000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "A": 200000,
        "B": 200000,
        "M": 600000
      }
    }
  },
  {
    "id": "nzc26",
    "group": "担保権・先取特権・公債権",
    "title": "優劣が循環する場合（国税徴収法26条）",
    "desc": "抵当権は地方税に優先し、地方税は（交付要求が先なので）国税に優先し、国税は（法定納期限等が登記より前なので）抵当権に優先する、という循環が生じる場合。国税徴収法26条により、まず租税をまとめて抵当権との間で配り、租税に配られた額を租税どうしの順位で分け直す。",
    "ronten": [
      "4-4"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-01",
            "amount": 1000000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "M",
          "creditor": "M",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2024-05-01",
          "filedOn": "2026-01-01",
          "principal": 500000,
          "label": "抵当権・物上代位"
        },
        {
          "id": "T1",
          "creditor": "国",
          "kind": "TAX",
          "legalDue": "2024-03-31",
          "demandAt": "2026-06-01T10:00",
          "principal": 300000,
          "label": "租税・交付要求"
        },
        {
          "id": "T2",
          "creditor": "市",
          "kind": "TAX",
          "legalDue": "2025-01-31",
          "demandAt": "2026-05-01T10:00",
          "principal": 400000,
          "label": "租税・交付要求"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "T1": 100000,
        "M": 500000,
        "T2": 400000
      }
    }
  },
  {
    "id": "gpp-order",
    "group": "担保権・先取特権・公債権",
    "title": "一般先取特権の順位（雇用関係＞子の監護の費用）",
    "desc": "雇用関係の先取特権、子の監護費用の先取特権、一般債権の順に配る。",
    "ronten": [
      "4-7"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-01",
            "amount": 500000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "E",
          "creditor": "E",
          "kind": "GPP",
          "gppClass": 2,
          "filedOn": "2026-03-01",
          "principal": 300000,
          "label": "給料（雇用関係）"
        },
        {
          "id": "W3",
          "creditor": "W",
          "kind": "SUP3",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 160000,
          "label": "養育費・先取特権"
        },
        {
          "id": "W2",
          "creditor": "W",
          "kind": "SUP2",
          "group": "W",
          "filedOn": "2026-01-05",
          "principal": 40000,
          "label": "養育費"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "E": 300000,
        "W3": 160000,
        "W2": 2963,
        "X": 37037
      }
    }
  },
  {
    "id": "tax76-seize",
    "group": "担保権・先取特権・公債権",
    "title": "給料：滞納処分の差押え（国税徴収法76条の範囲）",
    "desc": "滞納処分による差押えをした租税は、国税徴収法76条で差し押さえられる額まで配当に加わる（民執法の1/4・1/2とは範囲が違う）。",
    "ronten": [
      "3-3",
      "5-6"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-30",
            "amount": 154000,
            "interest": 0,
            "net": 300000,
            "capT": 154000
          }
        ]
      },
      "claims": [
        {
          "id": "T",
          "creditor": "市",
          "kind": "TAX",
          "taxSeizure": true,
          "demandAt": "2026-06-01",
          "principal": 200000,
          "label": "租税・交付要求"
        },
        {
          "id": "W3",
          "creditor": "W",
          "kind": "SUP3",
          "filedOn": "2026-01-05",
          "principal": 120000,
          "label": "養育費・先取特権"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "W3": 0,
        "X": 0,
        "T": 154000
      }
    }
  },
  {
    "id": "tax76-demand",
    "group": "担保権・先取特権・公債権",
    "title": "給料：交付要求だけの租税",
    "desc": "滞納処分による差押えがなく交付要求だけの租税は、手取額の1/4までの部分からしか配当を受けない。",
    "ronten": [
      "3-3",
      "5-6"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-30",
            "amount": 154000,
            "interest": 0,
            "net": 300000,
            "capT": 154000
          }
        ]
      },
      "claims": [
        {
          "id": "T",
          "creditor": "市",
          "kind": "TAX",
          "taxSeizure": false,
          "demandAt": "2026-06-01",
          "principal": 200000,
          "label": "租税・交付要求"
        },
        {
          "id": "W3",
          "creditor": "W",
          "kind": "SUP3",
          "filedOn": "2026-01-05",
          "principal": 120000,
          "label": "養育費・先取特権"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "filedOn": "2026-02-01",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "W3": 75000,
        "X": 0,
        "T": 75000
      },
      "surplus": 4000
    }
  },
  {
    "id": "beyond2y",
    "group": "担保権・先取特権・公債権",
    "title": "最後の2年分を超える利息・損害金",
    "desc": "抵当権の損害金のうち最後の2年分を超える部分は、一般債権と同じ順位で按分する（民法375条）。",
    "ronten": [
      "4-8"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d",
            "date": "2026-11-01",
            "amount": 2000000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "M",
          "creditor": "M",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2020-01-10",
          "effectiveOn": "2026-03-01",
          "filedOn": "2026-02-20",
          "damages": 1000000,
          "principal": 1000000,
          "beyond2y": 600000,
          "label": "抵当権・物上代位"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-04-01",
          "filedOn": "2026-03-20",
          "principal": 1000000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "M": 1625000,
        "X": 375000
      }
    }
  },
  {
    "id": "book-xv2",
    "group": "担保権・先取特権・公債権",
    "title": "根抵当権は極度額まで（配当表例2）",
    "desc": "根抵当権は極度額まで、先順位が取り切る。",
    "ronten": [
      "4-9"
    ],
    "source": "近藤基「債権配当の実務と書式〔第3版〕」194頁（民事法研究会・2021年）の参考例XV-2（配当表例2）を基に、計算の結果が変わらないよう金額・日付はそのままにし、名前を符号に置き換えたもの",
    "input": {
      "meta": {
        "date": "2026-10-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-01-01",
            "amount": 6400000,
            "interest": 1920
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "A",
          "amount": 1871
        }
      ],
      "claims": [
        {
          "id": "A",
          "creditor": "A",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2020-08-31",
          "maxAmount": 600000000,
          "damages": 560574605,
          "principal": 5479038390,
          "label": "抵当権・物上代位"
        },
        {
          "id": "B",
          "creditor": "B",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2020-10-14",
          "damages": 632474144,
          "principal": 2789636127,
          "label": "抵当権・物上代位"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "A": 6400049,
        "B": 0
      }
    }
  },
  {
    "id": "book-xvi3",
    "group": "担保権・先取特権・公債権",
    "title": "根抵当権者が途中から加入（配当表例3）",
    "desc": "根抵当権者が途中の供託から加入し、先順位として取り切る。",
    "ronten": [
      "1-4",
      "4-9"
    ],
    "source": "近藤基「債権配当の実務と書式〔第3版〕」213頁（民事法研究会・2021年）の参考例XVI-3（配当表例3）を基に、計算の結果が変わらないよう金額・日付はそのままにし、名前を符号に置き換えたもの",
    "input": {
      "meta": {
        "date": "2026-10-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "2026-03-31",
            "date": "2026-03-31",
            "amount": 300000,
            "interest": 180
          },
          {
            "id": "2026-04-28",
            "date": "2026-04-28",
            "amount": 300000,
            "interest": 150
          },
          {
            "id": "2026-05-31",
            "date": "2026-05-31",
            "amount": 300000,
            "interest": 120
          },
          {
            "id": "2026-06-29",
            "date": "2026-06-29",
            "amount": 300000,
            "interest": 90
          },
          {
            "id": "2026-07-31",
            "date": "2026-07-31",
            "amount": 300000,
            "interest": 60
          },
          {
            "id": "2026-08-31",
            "date": "2026-08-31",
            "amount": 300000,
            "interest": 30
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "A",
          "amount": 1770
        }
      ],
      "claims": [
        {
          "id": "E",
          "creditor": "A",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2020-08-03",
          "maxAmount": 50000000,
          "effectiveOn": "2026-03-01",
          "principal": 47890000,
          "label": "抵当権・物上代位"
        },
        {
          "id": "S",
          "creditor": "B",
          "kind": "GEN",
          "effectiveOn": "2026-03-15",
          "cost": 7660,
          "interest": 533468,
          "damages": 4535896,
          "principal": 35477864,
          "label": "貸金"
        },
        {
          "id": "T",
          "creditor": "C",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2020-07-21",
          "maxAmount": 150000000,
          "effectiveOn": "2026-06-10",
          "damages": 630501392,
          "principal": 1798578921,
          "label": "抵当権・物上代位"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "E": 898680,
        "S": 0,
        "T": 900180
      }
    }
  },
  {
    "id": "book-xvi4",
    "group": "担保権・先取特権・公債権",
    "title": "第三債務者が多数、抵当権と租税（配当表例4）",
    "desc": "4社の第三債務者の供託。抵当権と租税の優劣を供託金ごとに判断する。",
    "ronten": [
      "4-2",
      "7-7"
    ],
    "source": "近藤基「債権配当の実務と書式〔第3版〕」217頁（民事法研究会・2021年）の参考例XVI-4（配当表例4）を基に、計算の結果が変わらないよう金額・日付はそのままにし、名前を符号に置き換えたもの",
    "input": {
      "meta": {
        "date": "2026-10-10",
        "debtor": "S",
        "debtorLabel": "債務者兼所有者",
        "court": "○○地方裁判所第○民事部"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "shirakaba",
            "date": "2026-04-30",
            "amount": 2563080,
            "interest": 882,
            "thirdParty": "甲"
          },
          {
            "id": "sumire",
            "date": "2026-05-31",
            "amount": 1828482,
            "interest": 630,
            "thirdParty": "乙"
          },
          {
            "id": "seseragi",
            "date": "2026-06-30",
            "amount": 1508400,
            "interest": 525,
            "thirdParty": "丙"
          },
          {
            "id": "soyokaze",
            "date": "2026-07-31",
            "amount": 591300,
            "interest": 190,
            "thirdParty": "丁"
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "A",
          "amount": 3020
        }
      ],
      "claims": [
        {
          "id": "A1",
          "creditor": "A",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2020-06-15",
          "depositIds": [
            "shirakaba",
            "seseragi"
          ],
          "filedOn": "2025-01-01",
          "interest": 260685797,
          "principal": 1900000000,
          "label": "抵当権・物上代位"
        },
        {
          "id": "K",
          "creditor": "B",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2021-01-10",
          "depositIds": [
            "shirakaba",
            "seseragi"
          ],
          "filedOn": "2025-02-01",
          "damages": 46621413,
          "principal": 55599121,
          "label": "抵当権・物上代位"
        },
        {
          "id": "A2",
          "creditor": "A",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2020-06-15",
          "depositIds": [
            "sumire"
          ],
          "filedOn": "2025-03-01",
          "interest": 260685797,
          "principal": 1900000000,
          "label": "抵当権・物上代位"
        },
        {
          "id": "AD",
          "creditor": "C",
          "kind": "SEC",
          "secType": "MTG",
          "perfectedOn": "2021-02-06",
          "depositIds": [
            "soyokaze"
          ],
          "filedOn": "2025-04-01",
          "principal": 481292410,
          "label": "抵当権・物上代位"
        },
        {
          "id": "B1",
          "creditor": "○○県",
          "kind": "TAX",
          "legalDue": "2020-05-25",
          "demandAt": "2025-06-01T10:00",
          "depositIds": [
            "seseragi"
          ],
          "damages": 10623748,
          "principal": 34988100,
          "label": "租税・交付要求"
        },
        {
          "id": "T",
          "creditor": "○○県",
          "kind": "TAX",
          "legalDue": "2020-09-10",
          "demandAt": "2025-06-01T11:00",
          "depositIds": [
            "seseragi"
          ],
          "damages": 88844216,
          "principal": 59523300,
          "label": "租税・交付要求"
        },
        {
          "id": "B2",
          "creditor": "○○県",
          "kind": "TAX",
          "legalDue": "2020-06-23",
          "demandAt": "2025-06-02T10:00",
          "depositIds": [
            "soyokaze"
          ],
          "damages": 10623748,
          "principal": 34988100,
          "label": "租税・交付要求"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "A1": 2560942,
        "K": 0,
        "A2": 1829112,
        "AD": 0,
        "B1": 1508925,
        "T": 0,
        "B2": 591490
      }
    }
  },
  {
    "id": "prv-basic",
    "group": "仮差押え",
    "title": "仮差押えは支払留保、終期後の配当要求は除外",
    "desc": "仮差押債権者の配当額は供託して支払を留保し、配当要求の終期より後の配当要求は配当に加えない。",
    "ronten": [
      "6-1",
      "1-3"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "cutoffAt": "2026-11-01T10:00",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-01",
            "amount": 600000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-05-01",
          "filedOn": "2026-04-20",
          "principal": 400000,
          "label": "貸金"
        },
        {
          "id": "P",
          "creditor": "P",
          "kind": "PRV",
          "effectiveOn": "2026-06-01",
          "filedOn": "2026-05-20",
          "principal": 800000,
          "label": "売買代金"
        },
        {
          "id": "Y",
          "creditor": "Y",
          "kind": "GEN",
          "effectiveOn": "2026-11-02",
          "filedOn": "2026-11-02",
          "principal": 300000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "X": 200000,
        "P": 400000
      },
      "held": {
        "P": 400000
      }
    }
  },
  {
    "id": "prv-conv1",
    "group": "仮差押え",
    "title": "本執行に移行（仮差押えの額の範囲）",
    "desc": "仮差押えの額の範囲は仮差押えの時から配当加入する。",
    "ronten": [
      "6-5"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "cutoffAt": "2026-06-15T10:00",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-06-15",
            "at": "2026-06-15T10:00",
            "amount": 600000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "P",
          "creditor": "C",
          "kind": "PRV",
          "caseNo": "令和8年（ヨ）第5号",
          "effectiveOn": "2026-05-01T10:00",
          "filedOn": "2026-04-25",
          "principal": 400000,
          "label": "売買代金"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-06-01T10:00",
          "filedOn": "2026-05-25",
          "principal": 500000,
          "label": "貸金"
        },
        {
          "id": "C",
          "creditor": "C",
          "kind": "GEN",
          "fromPrv": "P",
          "effectiveOn": "2026-07-01T10:00",
          "filedOn": "2026-06-25",
          "damages": 50000,
          "principal": 400000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "C": 266667,
        "X": 333333
      }
    }
  },
  {
    "id": "prv-conv2",
    "group": "仮差押え",
    "title": "本執行に移行（仮差押えの額を超える部分）",
    "desc": "仮差押えの額を超える部分は、本差押えの時から配当加入する。",
    "ronten": [
      "6-5"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "cutoffAt": "2026-07-15T10:00",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-06-15",
            "at": "2026-06-15T10:00",
            "amount": 300000,
            "interest": 0
          },
          {
            "id": "d2",
            "date": "2026-07-15",
            "at": "2026-07-15T10:00",
            "amount": 300000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "P",
          "creditor": "C",
          "kind": "PRV",
          "effectiveOn": "2026-05-01T10:00",
          "filedOn": "2026-04-25",
          "principal": 400000,
          "label": "売買代金"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-06-01T10:00",
          "filedOn": "2026-05-25",
          "principal": 500000,
          "label": "貸金"
        },
        {
          "id": "C",
          "creditor": "C",
          "kind": "GEN",
          "fromPrv": "P",
          "effectiveOn": "2026-07-01T10:00",
          "filedOn": "2026-06-25",
          "damages": 50000,
          "principal": 400000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "C": 279487,
        "X": 320513
      }
    }
  },
  {
    "id": "prv-conv3",
    "group": "仮差押え",
    "title": "本執行に移行（本差押えが小さい）",
    "desc": "本差押えの額までは本差押えの欄で配当し、引き継がれなかった仮差押えの部分は支払留保。",
    "ronten": [
      "6-4"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-01",
            "amount": 600000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "P",
          "creditor": "C",
          "kind": "PRV",
          "caseNo": "令和8年（ヨ）第5号",
          "effectiveOn": "2026-05-01",
          "filedOn": "2026-04-25",
          "principal": 800000,
          "label": "売買代金"
        },
        {
          "id": "C",
          "creditor": "C",
          "kind": "GEN",
          "fromPrv": "P",
          "effectiveOn": "2026-07-01",
          "filedOn": "2026-06-25",
          "principal": 300000,
          "label": "貸金"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-06-01",
          "filedOn": "2026-05-25",
          "principal": 400000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "P": 250000,
        "C": 150000,
        "X": 200000
      },
      "held": {
        "P": 250000
      }
    }
  },
  {
    "id": "pres-1",
    "group": "仮差押え",
    "title": "仮差押えのみを原因とする供託",
    "desc": "仮差押えだけを原因とする第三債務者の供託。仮差押解放金とみなされる部分は、還付請求権への最初の差押命令が供託所に届いた時が配当要求の終期になる。それを超える部分は弁済供託に当たり、差押え等が競合した時が終期になる。",
    "ronten": [
      "2-1",
      "2-2",
      "2-3",
      "2-4"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-05-10",
            "amount": 1000000,
            "interest": 0,
            "preservation": true,
            "convertedAt": "2026-07-01T10:00",
            "releaseAmount": 600000
          }
        ]
      },
      "claims": [
        {
          "id": "P",
          "creditor": "P",
          "kind": "PRV",
          "effectiveOn": "2026-05-01T10:00",
          "filedOn": "2026-04-25",
          "principal": 600000,
          "label": "売買代金"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-07-01T10:00",
          "filedOn": "2026-06-20",
          "principal": 900000,
          "label": "貸金"
        },
        {
          "id": "Y",
          "creditor": "Y",
          "kind": "GEN",
          "effectiveOn": "2026-07-05T10:00",
          "filedOn": "2026-07-01",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "P": 240000,
        "X": 567692,
        "Y": 192308
      },
      "held": {
        "P": 240000
      }
    }
  },
  {
    "id": "pres-2",
    "group": "仮差押え",
    "title": "仮差押えのみの供託：超える部分が競合しない",
    "desc": "仮差押解放金の額を超える部分（弁済供託に当たる部分）に差押えが1件だけなら、その部分は配当にならない（差押債権者が取り立てる）。",
    "ronten": [
      "2-4"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-05-10",
            "amount": 1000000,
            "interest": 0,
            "preservation": true,
            "convertedAt": "2026-07-01T10:00",
            "releaseAmount": 600000
          }
        ]
      },
      "claims": [
        {
          "id": "P",
          "creditor": "P",
          "kind": "PRV",
          "effectiveOn": "2026-05-01T10:00",
          "filedOn": "2026-04-25",
          "principal": 600000,
          "label": "売買代金"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-07-01T10:00",
          "filedOn": "2026-06-20",
          "principal": 900000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "P": 240000,
        "X": 360000
      },
      "held": {
        "P": 240000
      }
    }
  },
  {
    "id": "pres-3",
    "group": "仮差押え",
    "title": "仮差押えのみの供託：本執行に移った債権者",
    "desc": "仮差押債権者が本執行に移り、他に差押えもある場合。最初の差押命令の送達や競合の時より後の差押えは、その部分の配当に加わらない。",
    "ronten": [
      "2-2"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-05-10",
            "amount": 1000000,
            "interest": 0,
            "preservation": true,
            "convertedAt": "2026-06-25T10:00",
            "releaseAmount": 600000
          }
        ]
      },
      "claims": [
        {
          "id": "P",
          "creditor": "P",
          "kind": "PRV",
          "effectiveOn": "2026-05-01T10:00",
          "filedOn": "2026-04-25",
          "principal": 600000,
          "label": "売買代金"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-07-01T10:00",
          "filedOn": "2026-06-20",
          "principal": 900000,
          "label": "貸金"
        },
        {
          "id": "Y",
          "creditor": "Y",
          "kind": "GEN",
          "effectiveOn": "2026-07-05T10:00",
          "filedOn": "2026-07-01",
          "principal": 500000,
          "label": "貸金"
        },
        {
          "id": "C",
          "creditor": "P",
          "kind": "GEN",
          "fromPrv": "P",
          "effectiveOn": "2026-06-25T10:00",
          "filedOn": "2026-06-15",
          "principal": 600000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "弁済金交付計算書",
      "paid": {
        "C": 600000,
        "X": 400000
      }
    }
  },
  {
    "id": "pres-wage",
    "group": "仮差押え",
    "title": "仮差押えのみの供託（給料等）",
    "desc": "給料の仮差押えのみの供託。手取額の1/4を超える部分と、仮差押解放金の額を超える部分は弁済供託に当たる。仮差押解放金とみなす額は、古い供託から順に充てる。",
    "ronten": [
      "2-5",
      "2-6"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "wage",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-05-25",
            "amount": 50000,
            "interest": 0,
            "net": 200000,
            "preservation": true,
            "convertedAt": "2026-08-01T10:00",
            "releaseAmount": 120000
          },
          {
            "id": "d2",
            "date": "2026-06-25",
            "amount": 80000,
            "interest": 0,
            "net": 200000,
            "preservation": true,
            "convertedAt": "2026-08-01T10:00",
            "releaseAmount": 120000
          },
          {
            "id": "d3",
            "date": "2026-07-25",
            "amount": 50000,
            "interest": 0,
            "net": 200000,
            "preservation": true,
            "convertedAt": "2026-08-01T10:00",
            "releaseAmount": 120000
          }
        ]
      },
      "claims": [
        {
          "id": "P",
          "creditor": "P",
          "kind": "PRV",
          "effectiveOn": "2026-05-01T10:00",
          "principal": 120000,
          "label": "売買代金"
        },
        {
          "id": "S",
          "creditor": "W",
          "kind": "SUP2",
          "effectiveOn": "2026-08-01T10:00",
          "principal": 300000,
          "label": "養育費"
        },
        {
          "id": "G",
          "creditor": "G",
          "kind": "GEN",
          "effectiveOn": "2026-08-10T10:00",
          "principal": 200000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "P": 34586,
        "S": 116905,
        "G": 28509
      },
      "held": {
        "P": 34586
      }
    }
  },
  {
    "id": "pres-multi",
    "group": "仮差押え",
    "title": "複数の仮差押えが競合したままの供託",
    "desc": "各仮差押えの仮差押解放金の額の合計までを、配当に加わる全員で按分する（各仮差押債権者は自分の解放金の額まで）。",
    "ronten": [
      "2-7"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-05-10",
            "amount": 1000000,
            "interest": 0,
            "preservation": true,
            "convertedAt": "2026-07-01T10:00"
          }
        ]
      },
      "claims": [
        {
          "id": "P1",
          "creditor": "P1",
          "kind": "PRV",
          "effectiveOn": "2026-04-01T10:00",
          "filedOn": "2026-03-25",
          "principal": 600000,
          "releaseAmount": 600000,
          "label": "売買代金"
        },
        {
          "id": "P2",
          "creditor": "P2",
          "kind": "PRV",
          "effectiveOn": "2026-04-15T10:00",
          "filedOn": "2026-04-10",
          "principal": 400000,
          "releaseAmount": 300000,
          "label": "売買代金"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-07-01T10:00",
          "filedOn": "2026-06-20",
          "principal": 200000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "P1": 490909,
        "P2": 245455,
        "X": 163636
      },
      "held": {
        "P1": 490909,
        "P2": 245455
      }
    }
  },
  {
    "id": "release-debtor",
    "group": "仮差押え",
    "title": "債務者が供託した仮差押解放金",
    "desc": "債務者が仮差押解放金を供託した場合。他の債権者が取戻請求権を差し押さえて競合した時が、配当要求の終期になる。",
    "ronten": [
      "9-2",
      "9-3"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-05-10",
            "amount": 500000,
            "interest": 0,
            "releaseByDebtor": true
          }
        ]
      },
      "claims": [
        {
          "id": "P",
          "creditor": "C",
          "kind": "PRV",
          "effectiveOn": "2026-04-01T10:00",
          "principal": 500000,
          "label": "売買代金"
        },
        {
          "id": "C",
          "creditor": "C",
          "kind": "GEN",
          "fromPrv": "P",
          "effectiveOn": "2026-07-01T10:00",
          "principal": 500000,
          "damages": 20000,
          "label": "貸金"
        },
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-07-10T10:00",
          "principal": 500000,
          "label": "貸金"
        },
        {
          "id": "Y",
          "creditor": "Y",
          "kind": "GEN",
          "effectiveOn": "2026-07-20T10:00",
          "principal": 500000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "C": 254902,
        "X": 245098
      }
    }
  },
  {
    "id": "book-xvi1",
    "group": "供託ごとの加入・特殊な場面",
    "title": "供託ごとに配当加入が異なる（配当表例1）",
    "desc": "途中から差し押さえた債権者がいるため、供託金ごとに配当に加わる債権者が異なる。加わる債権者の組合せごとに分けて計算し、配当加入等の状況表を付ける。",
    "ronten": [
      "1-4",
      "7-7"
    ],
    "source": "近藤基「債権配当の実務と書式〔第3版〕」207頁（民事法研究会・2021年）の参考例XVI-1（配当表例1）を基に、計算の結果が変わらないよう金額・日付はそのままにし、名前を符号に置き換えたもの",
    "input": {
      "meta": {
        "date": "2026-04-20",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "2025-11-25",
            "date": "2025-11-25",
            "amount": 62341,
            "interest": 24
          },
          {
            "id": "2025-12-10",
            "date": "2025-12-10",
            "amount": 358927,
            "interest": 105
          },
          {
            "id": "2025-12-25",
            "date": "2025-12-25",
            "amount": 63481,
            "interest": 18
          },
          {
            "id": "2026-01-25",
            "date": "2026-01-25",
            "amount": 62469,
            "interest": 12
          },
          {
            "id": "2026-02-25",
            "date": "2026-02-25",
            "amount": 63734,
            "interest": 6
          },
          {
            "id": "2026-03-10",
            "date": "2026-03-10",
            "amount": 189746,
            "interest": 0
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "A",
          "amount": 1850
        }
      ],
      "claims": [
        {
          "id": "A",
          "creditor": "A",
          "kind": "GEN",
          "effectiveOn": "2025-01-01",
          "filedOn": "2025-01-01",
          "principal": 239883,
          "label": "貸金"
        },
        {
          "id": "B",
          "creditor": "B",
          "kind": "GEN",
          "effectiveOn": "2025-02-01",
          "filedOn": "2025-02-01",
          "principal": 217695,
          "label": "貸金"
        },
        {
          "id": "C",
          "creditor": "C",
          "kind": "GEN",
          "effectiveOn": "2025-03-01",
          "filedOn": "2025-03-01",
          "principal": 305189,
          "label": "貸金"
        },
        {
          "id": "D",
          "creditor": "D",
          "kind": "GEN",
          "effectiveOn": "2025-12-15T10:00",
          "filedOn": "2025-12-01",
          "principal": 250000,
          "note": "債務名義提出",
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "A": 200989,
        "B": 182399,
        "C": 255707,
        "D": 159918
      }
    }
  },
  {
    "id": "mixed-deposit",
    "group": "供託ごとの加入・特殊な場面",
    "title": "混合供託（証明前）",
    "desc": "還付請求権が債務者に属することを証明する文書が出る前は参考計算として警告する。",
    "ronten": [
      "1-5"
    ],
    "input": {
      "meta": {
        "date": "2026-11-19",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-01-01",
            "amount": 376211,
            "interest": 87,
            "mixed": true
          }
        ]
      },
      "procedureCosts": [
        {
          "payee": "A",
          "amount": 1871
        }
      ],
      "claims": [
        {
          "id": "A",
          "creditor": "A",
          "kind": "GEN",
          "filedOn": "2025-01-01",
          "cost": 6660,
          "damages": 10977,
          "principal": 340000,
          "label": "貸金"
        },
        {
          "id": "B",
          "creditor": "B",
          "kind": "GEN",
          "filedOn": "2025-02-01",
          "cost": 3000,
          "interest": 12785,
          "damages": 58772,
          "principal": 250000,
          "label": "貸金"
        },
        {
          "id": "C",
          "creditor": "C",
          "kind": "GEN",
          "filedOn": "2025-03-01",
          "principal": 455000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "A": 117754,
        "B": 106862,
        "C": 149811
      }
    }
  },
  {
    "id": "residual",
    "group": "供託ごとの加入・特殊な場面",
    "title": "滞納処分庁からの残余金（供託を経ない）",
    "desc": "滞納処分が先に行われ、その残余金が執行裁判所に交付された場合（第三債務者の供託を経ない）。残余金の交付を受けた時が配当要求の終期になる。",
    "ronten": [
      "9-4"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-10-01",
            "amount": 300000,
            "residual": true,
            "residualVia": "cash",
            "depositedAt": "2026-08-01T10:00",
            "deliveredAt": "2026-10-01T10:00"
          }
        ]
      },
      "claims": [
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-07-01T10:00",
          "principal": 300000,
          "label": "貸金"
        },
        {
          "id": "Y",
          "creditor": "Y",
          "kind": "GEN",
          "effectiveOn": "2026-09-01T10:00",
          "principal": 300000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "X": 150000,
        "Y": 150000
      }
    }
  },
  {
    "id": "sale",
    "group": "供託ごとの加入・特殊な場面",
    "title": "売却命令による売得金",
    "desc": "執行官が売得金の交付を受けた時までの差押え等が加入する。",
    "ronten": [
      "9-5"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "saleProceeds": 400000,
        "saleAt": "2026-09-01T10:00",
        "deposits": []
      },
      "claims": [
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-07-01T10:00",
          "principal": 300000,
          "label": "貸金"
        },
        {
          "id": "Y",
          "creditor": "Y",
          "kind": "GEN",
          "effectiveOn": "2026-09-02T10:00",
          "principal": 300000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "弁済金交付計算書",
      "paid": {
        "X": 300000,
        "Y": 0
      },
      "surplus": 100000
    }
  },
  {
    "id": "stayed",
    "group": "供託ごとの加入・特殊な場面",
    "title": "執行停止中の供託",
    "desc": "執行停止中に第三債務者が供託した場合。供託の時を配当要求の終期とする（初期値）。執行を停止された差押債権者の配当額は支払を留保する。",
    "ronten": [
      "9-7"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "settings": {
        "stayedDeposit": "cutoff"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-08-01",
            "amount": 600000,
            "interest": 0,
            "stayed": true,
            "stayLiftedAt": "2026-10-01T10:00"
          }
        ]
      },
      "claims": [
        {
          "id": "X",
          "creditor": "X",
          "kind": "GEN",
          "effectiveOn": "2026-07-01T10:00",
          "principal": 600000,
          "stayed": true,
          "label": "貸金"
        },
        {
          "id": "Y",
          "creditor": "Y",
          "kind": "GEN",
          "effectiveOn": "2026-09-01T10:00",
          "principal": 600000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "弁済金交付計算書",
      "paid": {
        "X": 600000,
        "Y": 0
      },
      "held": {
        "X": 600000
      }
    }
  },
  {
    "id": "transfer",
    "group": "供託ごとの加入・特殊な場面",
    "title": "転付命令が効力を生じない場合",
    "desc": "転付命令の送達前に他の差押えがあり、転付命令は効力を生じない。",
    "ronten": [
      "9-8"
    ],
    "input": {
      "meta": {
        "date": "2026-12-10",
        "court": "○○地方裁判所第○民事部",
        "debtor": "S"
      },
      "fund": {
        "kind": "general",
        "deposits": [
          {
            "id": "d1",
            "date": "2026-11-01",
            "amount": 600000,
            "interest": 0
          }
        ]
      },
      "claims": [
        {
          "id": "T",
          "creditor": "T",
          "kind": "GEN",
          "effectiveOn": "2026-07-01T10:00",
          "transferServedAt": "2026-07-01T10:00",
          "principal": 600000,
          "label": "貸金"
        },
        {
          "id": "Y",
          "creditor": "Y",
          "kind": "GEN",
          "effectiveOn": "2026-06-20T10:00",
          "principal": 600000,
          "label": "貸金"
        }
      ]
    },
    "expect": {
      "type": "配当表",
      "paid": {
        "T": 300000,
        "Y": 300000
      }
    }
  }
];
})(typeof window !== 'undefined' ? window : globalThis);
