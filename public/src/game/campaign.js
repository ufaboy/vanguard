/** Campaign missions, sector definitions, and progression trees. */

export const CAMPAIGN_CHAPTERS = [
  {
    "id": "urban",
    "name": "City outskirts",
    "color": "#d6e7a0",
    "missions": [
      {
        "id": "campaign-01",
        "number": 1,
        "name": "First Contact",
        "objective": "Clear the outer streets",
        "layout": "An offset entry street leads to a broken market, civic square, and workshop court. Breach brick partitions for short flanks or follow the covered outer loop.",
        "difficulty": "Low",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 8,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 3,
          "maxConcurrent": 6,
          "notes": "Introduce only basic units; keep the first engagement free of crossfire."
        }
      },
      {
        "id": "campaign-02",
        "number": 2,
        "name": "Broken Avenue",
        "objective": "Clear the residential blocks",
        "layout": "A blocked east-west avenue links unequal residential courts. Breach three thin brick partitions for shorter flanks, or use the northern garden and southern garage loop.",
        "difficulty": "Low",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 9,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 3,
          "maxConcurrent": 6,
          "notes": "Alternate scout flanks with standard groups through the main avenue."
        }
      },
      {
        "id": "campaign-03",
        "number": 3,
        "name": "Civic Shelter",
        "objective": "Defend the district HQ",
        "layout": "Three approach streets surround a sheltered repair square; short waves teach repositioning.",
        "difficulty": "Low",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 13,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 3,
          "maxConcurrent": 6,
          "notes": "Introduce sappers after the opening wave; avoid mining every HQ approach at once."
        }
      },
      {
        "id": "campaign-04",
        "number": 4,
        "name": "Railway Cut",
        "objective": "Clear the station approaches",
        "layout": "Parallel platforms and service tunnels expose artillery positions from the flank.",
        "difficulty": "Moderate",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 14,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 4,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 3,
          "maxConcurrent": 6,
          "notes": "Introduce artillery behind breakable cover; keep a clear side route to each firing position."
        }
      },
      {
        "id": "campaign-05",
        "number": 5,
        "name": "Outer Gate",
        "objective": "Destroy the gate stronghold",
        "layout": "Two breach lanes and a rear service road conclude the city introduction.",
        "difficulty": "Moderate",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 3,
          "maxConcurrent": 6,
          "notes": "Use armor at the gate and standard tanks in side streets; artillery stays reachable from a flank."
        }
      }
    ]
  },
  {
    "id": "forest",
    "name": "Forest frontier",
    "color": "#80c89a",
    "missions": [
      {
        "id": "campaign-06",
        "number": 6,
        "name": "Green Border",
        "objective": "Clear the woodland road",
        "layout": "A visible road bends between forest pockets and open firing clearings.",
        "difficulty": "Moderate",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 2,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 7,
          "notes": "Reduce armored pressure after the city finale; scouts teach canopy ambush awareness."
        }
      },
      {
        "id": "campaign-07",
        "number": 7,
        "name": "Timberline",
        "objective": "Destroy the logging outpost",
        "layout": "Log yards alternate with dense canopy; a long flank avoids the main road.",
        "difficulty": "Moderate",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 11,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 7,
          "notes": "Sappers guard the logging lanes; armored anchors hold the outpost while standards rotate."
        }
      },
      {
        "id": "campaign-08",
        "number": 8,
        "name": "Hidden Signals",
        "objective": "Clear the relay clearing",
        "layout": "Separated clearings introduce electronic interference with safe retreat corridors.",
        "difficulty": "Moderate",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 14,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 2,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 7,
          "notes": "Introduce one jammer at a time with standard escorts, never overlapping both jammer zones."
        }
      },
      {
        "id": "campaign-09",
        "number": 9,
        "name": "River Watch",
        "objective": "Defend the forest HQ",
        "layout": "A river splits enemy approaches; two permanent land crossings remain usable by every chassis.",
        "difficulty": "Moderate",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 11,
            "phase": "regular"
          },
          {
            "type": "HOVER",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 4,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 7,
          "notes": "Hover units use water flanks; artillery pressures the HQ only after the first standard wave."
        }
      },
      {
        "id": "campaign-10",
        "number": 10,
        "name": "Deepwood Bastion",
        "objective": "Destroy the forest stronghold",
        "layout": "A ring of woodland hides approaches to a concrete center with two breach points.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "STEALTH",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 7,
          "notes": "Introduce stealth in separated encounters; do not combine two stealth tanks with an active jammer."
        }
      }
    ]
  },
  {
    "id": "desert",
    "name": "Desert crossing",
    "color": "#e4bc79",
    "missions": [
      {
        "id": "campaign-11",
        "number": 11,
        "name": "Dust Frontier",
        "objective": "Clear the caravan road",
        "layout": "Open sightlines are broken by rock-shaped concrete cover and ruined shelters.",
        "difficulty": "Moderate",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 8,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 6,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Introduce strikers across open lanes after scouts reveal the approach; preserve hard cover."
        }
      },
      {
        "id": "campaign-12",
        "number": 12,
        "name": "Dry Wells",
        "objective": "Defend the oasis HQ",
        "layout": "A compact safe center faces attacks from alternating dry channels.",
        "difficulty": "Moderate",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 13,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "KAMIKAZE",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Introduce kamikazes one at a time with a visible approach and a clear interception lane."
        }
      },
      {
        "id": "campaign-13",
        "number": 13,
        "name": "Canyon Teeth",
        "objective": "Clear the canyon pass",
        "layout": "Switchback lanes and cross-links prevent a single unavoidable firing corridor.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 7,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Armor holds bends while artillery fires from bypassable pockets; no unavoidable crossfire."
        }
      },
      {
        "id": "campaign-14",
        "number": 14,
        "name": "Mirage Array",
        "objective": "Destroy the desert relay",
        "layout": "Scattered ruins shelter an approach to a jammer-supported enemy base.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 8,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Rotate striker groups between ruins; deploy jammers serially rather than together."
        }
      },
      {
        "id": "campaign-15",
        "number": 15,
        "name": "Sunken Fortress",
        "objective": "Destroy the desert stronghold",
        "layout": "A fortified basin offers a direct breach and a longer protected perimeter route.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 7,
            "phase": "regular"
          },
          {
            "type": "FLAMETHROWER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "BOSS_MAMMOTH",
            "count": 1,
            "phase": "boss"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Introduce flamethrowers in small groups with escape space; armor guards the stronghold and Mammoth MK-V commands the final defense."
        }
      }
    ]
  },
  {
    "id": "coast",
    "name": "Coastal wetlands",
    "color": "#75c8d0",
    "missions": [
      {
        "id": "campaign-16",
        "number": 16,
        "name": "Salt Approach",
        "objective": "Clear the coastal causeway",
        "layout": "Dry roads link islands of cover; water creates optional amphibious shortcuts.",
        "difficulty": "Moderate",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 11,
            "phase": "regular"
          },
          {
            "type": "HOVER",
            "count": 9,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Use standard tanks on dry roads and hover groups on water; lower specialist pressure after the fortress."
        }
      },
      {
        "id": "campaign-17",
        "number": 17,
        "name": "Reed Ambush",
        "objective": "Clear the wetland crossings",
        "layout": "Canopy and water divide the battlefield into small readable engagements.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 9,
            "phase": "regular"
          },
          {
            "type": "HOVER",
            "count": 8,
            "phase": "regular"
          },
          {
            "type": "STEALTH",
            "count": 4,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Alternate stealth and hover pressure; leave at least one readable dry escape route."
        }
      },
      {
        "id": "campaign-18",
        "number": 18,
        "name": "Harbor Refuge",
        "objective": "Defend the dock HQ",
        "layout": "Two land approaches and one amphibious enemy lane challenge target priorities.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "HOVER",
            "count": 8,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 2,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Alternate dock waves with water flanks; avoid synchronizing artillery volleys on the HQ."
        }
      },
      {
        "id": "campaign-19",
        "number": 19,
        "name": "Breakwater",
        "objective": "Destroy the harbor stronghold",
        "layout": "Quays and warehouses create parallel assault routes around a central basin.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "HOVER",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 5,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Armor anchors the quays while strikers punish exposed crossings; maintain warehouse cover."
        }
      },
      {
        "id": "campaign-20",
        "number": 20,
        "name": "Tidal Lock",
        "objective": "Clear the estuary defenses",
        "layout": "A broad lock complex combines water flanks with the planned Hydra encounter.",
        "difficulty": "Chapter finale",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "HOVER",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "BOSS_HYDRA",
            "count": 1,
            "phase": "boss"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Clear 27 regular tanks before Hydra arrives; no extra regular waves during the boss phase."
        }
      }
    ]
  },
  {
    "id": "alpine",
    "name": "Frozen highlands",
    "color": "#b0c9e7",
    "missions": [
      {
        "id": "campaign-21",
        "number": 21,
        "name": "Cold Ascent",
        "objective": "Clear the mountain road",
        "layout": "Ice patches are introduced beside safe dry routes and generous braking space.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 8,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 2,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Reintroduce basic groups on ice before heavier units; keep dry braking zones available."
        }
      },
      {
        "id": "campaign-22",
        "number": 22,
        "name": "White Relay",
        "objective": "Destroy the alpine relay",
        "layout": "Frozen open ground surrounds concrete shelters and an exposed communications base.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Jammers follow the first artillery encounter; avoid covering every shelter with indirect fire."
        }
      },
      {
        "id": "campaign-23",
        "number": 23,
        "name": "Summit Refuge",
        "objective": "Defend the mountain HQ",
        "layout": "Alternating waves approach across three passes with short defensive rotations.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 8,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Alternate armor and striker waves; sappers arrive between major pushes, not during peak HQ pressure."
        }
      },
      {
        "id": "campaign-24",
        "number": 24,
        "name": "Glacier Cut",
        "objective": "Clear the frozen crossing",
        "layout": "Multiple land passages and optional ice lanes reward deliberate movement.",
        "difficulty": "Very high",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 10,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 4,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Sappers and artillery create route choices; never mine every land crossing at once."
        }
      },
      {
        "id": "campaign-25",
        "number": 25,
        "name": "Iron Avalanche",
        "objective": "Clear the summit fortress",
        "layout": "A wide fortified plateau provides room to flank and dodge the Cerberus-T thermobaric leviathan.",
        "difficulty": "Chapter finale",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 9,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 2,
            "phase": "regular"
          },
          {
            "type": "BOSS_INFERNO",
            "count": 1,
            "phase": "boss"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Clear 29 regular tanks before Cerberus-T arrives; preserve open flanking routes against its overdrive ram and 2.5-cell thermobaric blasts."
        }
      }
    ]
  },
  {
    "id": "industrial",
    "name": "Industrial belt",
    "color": "#d89a76",
    "missions": [
      {
        "id": "campaign-26",
        "number": 26,
        "name": "Foundry Road",
        "objective": "Clear the factory approaches",
        "layout": "Factory blocks mix close cover with long service-road sightlines.",
        "difficulty": "High",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 13,
            "phase": "regular"
          },
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "FLAMETHROWER",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 5,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Flamethrowers occupy factory alleys; standard tanks and scouts use service roads."
        }
      },
      {
        "id": "campaign-27",
        "number": 27,
        "name": "Freight Spine",
        "objective": "Destroy the freight stronghold",
        "layout": "Rail yards provide three connected lanes with destructible cargo barriers.",
        "difficulty": "Very high",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "ENGINEER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 7,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "KAMIKAZE",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Introduce engineers in separated groups; kamikazes arrive one at a time along exposed freight lanes."
        }
      },
      {
        "id": "campaign-28",
        "number": 28,
        "name": "Power Reserve",
        "objective": "Defend the substation HQ",
        "layout": "A central repair yard requires rapid responses to alternating attack directions.",
        "difficulty": "Very high",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 13,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Rotate jammers with sapper pushes; do not overlap jammer pressure with the largest striker wave."
        }
      },
      {
        "id": "campaign-29",
        "number": 29,
        "name": "Furnace District",
        "objective": "Clear the steelworks",
        "layout": "Three offset casting yards connect through short furnace passages. Converter and casting-house cover breaks the central exposure; four brick cuts and side exits preserve retreats.",
        "difficulty": "Very high",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "FLAMETHROWER",
            "count": 7,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "ENGINEER",
            "count": 2,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Alternate flame and artillery groups; engineers reinforce side lanes without sealing all exits."
        }
      },
      {
        "id": "campaign-30",
        "number": 30,
        "name": "Capital Breach",
        "objective": "Destroy the perimeter stronghold",
        "layout": "Three offset transverse defensive lines offer a short gate-breaching route and alternating west/east bypasses, with cover at each staging area.",
        "difficulty": "Very high",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 11,
            "phase": "regular"
          },
          {
            "type": "ENGINEER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 8,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 2,
            "phase": "regular"
          },
          {
            "type": "BOSS_MAMMOTH",
            "count": 1,
            "phase": "boss"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Use armor for the main breach and strikers on flanks; Mammoth MK-V deploys when the garrison falls or the citadel core is breached."
        }
      }
    ]
  },
  {
    "id": "capital",
    "name": "Capital city",
    "color": "#dda4a1",
    "missions": [
      {
        "id": "campaign-31",
        "number": 31,
        "name": "Return to the Streets",
        "objective": "Clear the capital outskirts",
        "layout": "Unequal city blocks form a sheltered western arcade and an exposed eastern tramway, linked by cross-streets and a destructible market partition.",
        "difficulty": "Very high",
        "status": "available",
        "enemyRoster": [
          {
            "type": "SCOUT",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 7,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "STEALTH",
            "count": 2,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Revisit city tactics with small stealth groups; retain lower density than the industrial finale."
        }
      },
      {
        "id": "campaign-32",
        "number": 32,
        "name": "Boulevard of Steel",
        "objective": "Destroy the boulevard stronghold",
        "layout": "A fortified avenue is balanced by two destructible side-block routes.",
        "difficulty": "Very high",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 12,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 6,
            "phase": "regular"
          },
          {
            "type": "ENGINEER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 2,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Artillery holds the boulevard while engineers reinforce side blocks; both flanks remain breachable."
        }
      },
      {
        "id": "campaign-33",
        "number": 33,
        "name": "Last Shelter",
        "objective": "Defend the civic HQ",
        "layout": "The final defense mission combines staggered assaults and protected fallback positions.",
        "difficulty": "Very high",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 11,
            "phase": "regular"
          },
          {
            "type": "STRIKER",
            "count": 7,
            "phase": "regular"
          },
          {
            "type": "SAPPER",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "FLAMETHROWER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "KAMIKAZE",
            "count": 3,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Use short alternating waves; at most two kamikazes appear together, never alongside a full flame group."
        }
      },
      {
        "id": "campaign-34",
        "number": 34,
        "name": "Citadel Ring",
        "objective": "Destroy the inner stronghold",
        "layout": "A ring road supports flanking across successive defensive layers without requiring hover.",
        "difficulty": "Very high",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 11,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 8,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "STEALTH",
            "count": 5,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 4,
            "phase": "regular"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Layer armor, stealth, and jammer encounters; avoid simultaneous saturation of every ring-road exit."
        }
      },
      {
        "id": "campaign-35",
        "number": 35,
        "name": "Vanguard Dawn",
        "objective": "Clear the capital citadel",
        "layout": "A ruined civic square provides cover breaks and full flanking space for the final Titan encounter.",
        "difficulty": "Campaign finale",
        "status": "available",
        "enemyRoster": [
          {
            "type": "STANDARD",
            "count": 11,
            "phase": "regular"
          },
          {
            "type": "STANDARD",
            "count": 1,
            "phase": "bossEscort"
          },
          {
            "type": "ARMOR",
            "count": 8,
            "phase": "regular"
          },
          {
            "type": "ARMOR",
            "count": 1,
            "phase": "bossEscort"
          },
          {
            "type": "STRIKER",
            "count": 4,
            "phase": "regular"
          },
          {
            "type": "HOWITZER",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "JAMMER",
            "count": 3,
            "phase": "regular"
          },
          {
            "type": "BOSS_TITAN",
            "count": 1,
            "phase": "boss"
          }
        ],
        "deploymentPlan": {
          "initialCount": 4,
          "maxConcurrent": 8,
          "notes": "Clear 29 regular tanks, then survive the All-Boss Escalation: Mammoth MK-V -> Hydra MLRS-9 + Cerberus-T -> Supreme Dreadnought Titan (with its 60% HP escort)."
        }
      }
    ]
  }
];

export const CAMPAIGN_MISSIONS = CAMPAIGN_CHAPTERS.flatMap(chapter => chapter.missions.map(mission => ({
  ...mission,
  chapterId: chapter.id,
  theme: chapter.name,
  color: chapter.color,
  enemyTotal: mission.enemyRoster.reduce((total, group) => total + group.count, 0),
})));

export function isCampaignMissionUnlocked(id, completedMissions = {}) {
  const index = CAMPAIGN_MISSIONS.findIndex(mission => mission.id === id);
  if (index < 0 || CAMPAIGN_MISSIONS[index].status !== 'available') return false;
  return index === 0 || Boolean(completedMissions[id]) || Boolean(completedMissions[CAMPAIGN_MISSIONS[index - 1].id]);
}
