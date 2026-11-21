/** Campaign missions, sector definitions, and progression trees. */
import { N_ } from '../i18n/index.js';

export const CAMPAIGN_CHAPTERS = [
  {
    "id": "urban",
    "name": N_("City outskirts"),
    "color": "#d6e7a0",
    "missions": [
      {
        "id": "campaign-01",
        "number": 1,
        "name": N_("Rome: Forum & Colosseum"),
        "objective": N_("Clear the Consortium strike teams before they regroup"),
        "briefing": N_("Consortium strike teams have occupied the Roman Forum and the Colosseum square. A howitzer covers the central avenue, so use the temple passages and brick breaches to flank their positions. Clear every hostile unit before they regroup."),
        "layout": N_("Interlocking urban loops through the Roman Forum, a bent imperial avenue and the Colosseum square, with cross streets and three destructible breaches."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":5,"phase":"regular"},{"type":"STANDARD","count":14,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Three Consortium strike groups: Forum patrols, a Colosseum flank with one howitzer, and a two-lane rearguard."}
      },
      {
        "id": "campaign-02",
        "number": 2,
        "name": N_("Placeholder Mission"),
        "objective": N_("Destroy all hostiles"),
        "briefing": N_("Placeholder sector. Tactical reconnaissance and command briefing are pending."),
        "layout": N_("Empty placeholder until the campaign story is written: a plain field with three roads and scattered cover."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":16,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":4,"notes":"Placeholder: three waves of light tanks, each starting three seconds after the previous one is destroyed."}
      },
      {
        "id": "campaign-03",
        "number": 3,
        "name": N_("Placeholder Mission"),
        "objective": N_("Destroy all hostiles"),
        "briefing": N_("Placeholder sector. Tactical reconnaissance and command briefing are pending."),
        "layout": N_("Empty placeholder until the campaign story is written: a plain field with three roads and scattered cover."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":16,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":4,"notes":"Placeholder: three waves of light tanks, each starting three seconds after the previous one is destroyed."}
      },
      {
        "id": "campaign-04",
        "number": 4,
        "name": N_("Placeholder Mission"),
        "objective": N_("Destroy all hostiles"),
        "briefing": N_("Placeholder sector. Tactical reconnaissance and command briefing are pending."),
        "layout": N_("Empty placeholder until the campaign story is written: a plain field with three roads and scattered cover."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":16,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":4,"notes":"Placeholder: three waves of light tanks, each starting three seconds after the previous one is destroyed."}
      },
      {
        "id": "campaign-05",
        "number": 5,
        "name": N_("Placeholder Mission"),
        "objective": N_("Destroy all hostiles"),
        "briefing": N_("Placeholder sector. Tactical reconnaissance and command briefing are pending."),
        "layout": N_("Empty placeholder until the campaign story is written: a plain field with three roads and scattered cover."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":16,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":4,"notes":"Placeholder: three waves of light tanks, each starting three seconds after the previous one is destroyed."}
      }
    ]
  },
  {
    "id": "forest",
    "name": N_("Forest frontier"),
    "color": "#80c89a",
    "missions": [
      {
        "id": "campaign-06",
        "number": 6,
        "name": N_("Green Border"),
        "objective": N_("Clear the woodland road"),
        "briefing": N_("Enemy patrols are probing the northern woodland road. Use the forest canopy to break line of sight, and watch for sappers laying mines along the main lane."),
        "layout": N_("A visible road bends between forest pockets and open firing clearings."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":10,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":7,"notes":"Reduce armored pressure after the city finale; scouts teach canopy ambush awareness."}
      },
      {
        "id": "campaign-07",
        "number": 7,
        "name": N_("Timberline"),
        "objective": N_("Destroy the logging outpost"),
        "briefing": N_("Hostile forces have fortified the logging yards with armored support and sapper teams. Bypass the mined haul road through the eastern timberline to strike their command post."),
        "layout": N_("Log yards alternate with dense canopy; a long flank avoids the main road."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":5,"phase":"regular"},{"type":"STANDARD","count":11,"phase":"regular"},{"type":"SAPPER","count":4,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":7,"notes":"Sappers guard the logging lanes; armored anchors hold the outpost while standards rotate."}
      },
      {
        "id": "campaign-08",
        "number": 8,
        "name": N_("Hidden Signals"),
        "objective": N_("Clear the relay clearing"),
        "briefing": N_("Electronic warfare units are jamming sector communications from the relay clearing. Advance between the forest pockets, neutralize the jammers first, and keep your retreat corridor open."),
        "layout": N_("Separated clearings introduce electronic interference with safe retreat corridors."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":5,"phase":"regular"},{"type":"STANDARD","count":14,"phase":"regular"},{"type":"SAPPER","count":3,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":7,"notes":"Introduce one jammer at a time with standard escorts, never overlapping both jammer zones."}
      },
      {
        "id": "campaign-09",
        "number": 9,
        "name": N_("River Watch"),
        "objective": N_("Defend the forest HQ"),
        "briefing": N_("Enemy hovercraft and howitzers are converging on our forest HQ across the river. Hold the two permanent land crossings and silence the artillery before it levels the base."),
        "layout": N_("A river splits enemy approaches; two permanent land crossings remain usable by every chassis."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":11,"phase":"regular"},{"type":"HOVER","count":6,"phase":"regular"},{"type":"HOWITZER","count":4,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":7,"notes":"Hover units use water flanks; artillery pressures the HQ only after the first standard wave."}
      },
      {
        "id": "campaign-10",
        "number": 10,
        "name": N_("Deepwood Bastion"),
        "objective": N_("Destroy the forest stronghold"),
        "briefing": N_("A fortified concrete bastion guards the deepwood interior, screened by stealth tanks and jammers. Probe the woodland perimeter for the two brick breach points and destroy the stronghold core."),
        "layout": N_("A ring of woodland hides approaches to a concrete center with two breach points."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"STEALTH","count":4,"phase":"regular"},{"type":"ARMOR","count":5,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":7,"notes":"Introduce stealth in separated encounters; do not combine two stealth tanks with an active jammer."}
      }
    ]
  },
  {
    "id": "desert",
    "name": N_("Desert crossing"),
    "color": "#e4bc79",
    "missions": [
      {
        "id": "campaign-11",
        "number": 11,
        "name": N_("Dust Frontier"),
        "objective": N_("Clear the caravan road"),
        "briefing": N_("Fast striker missile carriers and scouts control the open caravan road. Move from rock shelter to rock shelter and close the distance before their ATGMs lock onto your hull."),
        "layout": N_("Open sightlines are broken by rock-shaped concrete cover and ruined shelters."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":8,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"STRIKER","count":6,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Introduce strikers across open lanes after scouts reveal the approach; preserve hard cover."}
      },
      {
        "id": "campaign-12",
        "number": 12,
        "name": N_("Dry Wells"),
        "objective": N_("Defend the oasis HQ"),
        "briefing": N_("Multiple hostile columns are attacking the oasis HQ from dry desert channels, backed by sappers and kamikaze units. Intercept fast charges early and keep mines off the central approaches."),
        "layout": N_("A compact safe center faces attacks from alternating dry channels."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":13,"phase":"regular"},{"type":"SAPPER","count":5,"phase":"regular"},{"type":"KAMIKAZE","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Introduce kamikazes one at a time with a visible approach and a clear interception lane."}
      },
      {
        "id": "campaign-13",
        "number": 13,
        "name": N_("Canyon Teeth"),
        "objective": N_("Clear the canyon pass"),
        "briefing": N_("Heavy armor and howitzer batteries hold the canyon switchbacks. Use the cross-links between lanes to avoid prolonged fire in a single corridor and flank the heavy hulls."),
        "layout": N_("Switchback lanes and cross-links prevent a single unavoidable firing corridor."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"HOWITZER","count":5,"phase":"regular"},{"type":"ARMOR","count":7,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Armor holds bends while artillery fires from bypassable pockets; no unavoidable crossfire."}
      },
      {
        "id": "campaign-14",
        "number": 14,
        "name": N_("Mirage Array"),
        "objective": N_("Destroy the desert relay"),
        "briefing": N_("A jammer-screened desert relay is coordinating striker salvos across the ruins. Advance through the scattered cover to disable the jammers, then smash the enemy command post."),
        "layout": N_("Scattered ruins shelter an approach to a jammer-supported enemy base."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":12,"phase":"regular"},{"type":"STRIKER","count":8,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Rotate striker groups between ruins; deploy jammers serially rather than together."}
      },
      {
        "id": "campaign-15",
        "number": 15,
        "name": N_("Sunken Fortress"),
        "objective": N_("Destroy the desert stronghold"),
        "briefing": N_("Sector Boss MAMMOTH MK-V defends the sunken desert fortress alongside heavy armor and flamethrowers. Breach the basin or circle the perimeter, and keep moving to hit Mammoth in the flanks."),
        "layout": N_("A fortified basin offers a direct breach and a longer protected perimeter route."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"ARMOR","count":7,"phase":"regular"},{"type":"FLAMETHROWER","count":4,"phase":"regular"},{"type":"HOWITZER","count":4,"phase":"regular"},{"type":"BOSS_MAMMOTH","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Introduce flamethrowers in small groups with escape space; armor guards the stronghold and Mammoth MK-V commands the final defense."}
      }
    ]
  },
  {
    "id": "coast",
    "name": N_("Coastal wetlands"),
    "color": "#75c8d0",
    "missions": [
      {
        "id": "campaign-16",
        "number": 16,
        "name": N_("Salt Approach"),
        "objective": N_("Clear the coastal causeway"),
        "briefing": N_("Amphibious hovercraft dominate the coastal causeway and water shortcuts. Use the dry road islands for solid footing and intercept hover units as they cross open water."),
        "layout": N_("Dry roads link islands of cover; water creates optional amphibious shortcuts."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":11,"phase":"regular"},{"type":"HOVER","count":9,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Use standard tanks on dry roads and hover groups on water; lower specialist pressure after the fortress."}
      },
      {
        "id": "campaign-17",
        "number": 17,
        "name": N_("Reed Ambush"),
        "objective": N_("Clear the wetland crossings"),
        "briefing": N_("Stealth tanks and hovercraft are staging ambushes between the reed beds and flooded channels. Clear each pocket methodically instead of rushing blindly into concealed crossfire."),
        "layout": N_("Canopy and water divide the battlefield into small readable engagements."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":9,"phase":"regular"},{"type":"HOVER","count":8,"phase":"regular"},{"type":"STEALTH","count":4,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Alternate stealth and hover pressure; leave at least one readable dry escape route."}
      },
      {
        "id": "campaign-18",
        "number": 18,
        "name": N_("Harbor Refuge"),
        "objective": N_("Defend the dock HQ"),
        "briefing": N_("Enemy forces are assaulting the dock HQ along two land lanes and an open water flank. Prioritize the howitzers shelling from range while blocking hovercraft on the shoreline."),
        "layout": N_("Two land approaches and one amphibious enemy lane challenge target priorities."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":12,"phase":"regular"},{"type":"HOVER","count":8,"phase":"regular"},{"type":"HOWITZER","count":4,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Alternate dock waves with water flanks; avoid synchronizing artillery volleys on the HQ."}
      },
      {
        "id": "campaign-19",
        "number": 19,
        "name": N_("Breakwater"),
        "objective": N_("Destroy the harbor stronghold"),
        "briefing": N_("Armored units and missile strikers hold the breakwater quays around a central basin. Pick one warehouse lane, break through the defenders, and destroy the harbor stronghold."),
        "layout": N_("Quays and warehouses create parallel assault routes around a central basin."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":10,"phase":"regular"},{"type":"HOVER","count":6,"phase":"regular"},{"type":"ARMOR","count":6,"phase":"regular"},{"type":"STRIKER","count":5,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Armor anchors the quays while strikers punish exposed crossings; maintain warehouse cover."}
      },
      {
        "id": "campaign-20",
        "number": 20,
        "name": N_("Tidal Lock"),
        "objective": N_("Clear the estuary defenses"),
        "briefing": N_("Sector Boss HYDRA MLRS-9 anchors the estuary defenses with long-range rocket salvos and jammer support. Close the gap through the lock cover, watch the salvo markers, and watch out for its close-range flame."),
        "layout": N_("A broad lock complex combines water flanks with the planned Hydra encounter."),
        "difficulty": N_("Chapter finale"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":10,"phase":"regular"},{"type":"HOVER","count":10,"phase":"regular"},{"type":"HOWITZER","count":4,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"BOSS_HYDRA","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Clear 27 regular tanks before Hydra arrives; no extra regular waves during the boss phase."}
      }
    ]
  },
  {
    "id": "alpine",
    "name": N_("Frozen highlands"),
    "color": "#b0c9e7",
    "missions": [
      {
        "id": "campaign-21",
        "number": 21,
        "name": N_("Cold Ascent"),
        "objective": N_("Clear the mountain road"),
        "briefing": N_("Ice sheets line the mountain ascent, reducing traction on exposed turns. Stick to dry road segments when engaging armored units and howitzers on the slopes."),
        "layout": N_("Ice patches are introduced beside safe dry routes and generous braking space."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":8,"phase":"regular"},{"type":"STANDARD","count":12,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Reintroduce basic groups on ice before heavier units; keep dry braking zones available."}
      },
      {
        "id": "campaign-22",
        "number": 22,
        "name": N_("White Relay"),
        "objective": N_("Destroy the alpine relay"),
        "briefing": N_("Howitzers, strikers, and jammers guard an exposed alpine communications relay. Clear the jamming screen from behind the concrete shelters before pushing into the open base."),
        "layout": N_("Frozen open ground surrounds concrete shelters and an exposed communications base."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":12,"phase":"regular"},{"type":"HOWITZER","count":5,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Jammers follow the first artillery encounter; avoid covering every shelter with indirect fire."}
      },
      {
        "id": "campaign-23",
        "number": 23,
        "name": N_("Summit Refuge"),
        "objective": N_("Defend the mountain HQ"),
        "briefing": N_("Staggered enemy waves are pressing our mountain HQ across three alpine passes. Rotate quickly between lanes, stop sappers at the chokes, and preserve your base cover."),
        "layout": N_("Alternating waves approach across three passes with short defensive rotations."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":12,"phase":"regular"},{"type":"ARMOR","count":8,"phase":"regular"},{"type":"STRIKER","count":5,"phase":"regular"},{"type":"SAPPER","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Alternate armor and striker waves; sappers arrive between major pushes, not during peak HQ pressure."}
      },
      {
        "id": "campaign-24",
        "number": 24,
        "name": N_("Glacier Cut"),
        "objective": N_("Clear the frozen crossing"),
        "briefing": N_("Sappers and howitzers control the glacier crossings between multiple frozen passages. Choose deliberate routes around mined lanes and dismantle the artillery batteries one by one."),
        "layout": N_("Multiple land passages and optional ice lanes reward deliberate movement."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"SAPPER","count":6,"phase":"regular"},{"type":"HOWITZER","count":5,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Sappers and artillery create route choices; never mine every land crossing at once."}
      },
      {
        "id": "campaign-25",
        "number": 25,
        "name": N_("Iron Avalanche"),
        "objective": N_("Clear the summit fortress"),
        "briefing": N_("Sector Boss CERBERUS-T holds the summit plateau with thermobaric shells that scorch cover and melt ice. Stay outside its overdrive ram path and flank it across the plateau."),
        "layout": N_("A wide fortified plateau provides room to flank and dodge the Cerberus-T thermobaric leviathan."),
        "difficulty": N_("Chapter finale"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":12,"phase":"regular"},{"type":"ARMOR","count":9,"phase":"regular"},{"type":"STRIKER","count":6,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"BOSS_INFERNO","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Clear 29 regular tanks before Cerberus-T arrives; preserve open flanking routes against its overdrive ram and 2.5-cell thermobaric blasts."}
      }
    ]
  },
  {
    "id": "industrial",
    "name": N_("Industrial belt"),
    "color": "#d89a76",
    "missions": [
      {
        "id": "campaign-26",
        "number": 26,
        "name": N_("Foundry Road"),
        "objective": N_("Clear the factory approaches"),
        "briefing": N_("Flamethrowers and heavy armor patrol the foundry blocks and long service roads. Keep your distance in tight alleys and use the long sightlines to thin them out."),
        "layout": N_("Factory blocks mix close cover with long service-road sightlines."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":13,"phase":"regular"},{"type":"SCOUT","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":6,"phase":"regular"},{"type":"ARMOR","count":5,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Flamethrowers occupy factory alleys; standard tanks and scouts use service roads."}
      },
      {
        "id": "campaign-27",
        "number": 27,
        "name": N_("Freight Spine"),
        "objective": N_("Destroy the freight stronghold"),
        "briefing": N_("Engineers are repairing damaged defenses along the rail yards while kamikaze units rush the cargo lanes. Smash the destructible barriers, eliminate the engineers first, and destroy the freight stronghold."),
        "layout": N_("Rail yards provide three connected lanes with destructible cargo barriers."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":12,"phase":"regular"},{"type":"ENGINEER","count":4,"phase":"regular"},{"type":"ARMOR","count":7,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"},{"type":"KAMIKAZE","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Introduce engineers in separated groups; kamikazes arrive one at a time along exposed freight lanes."}
      },
      {
        "id": "campaign-28",
        "number": 28,
        "name": N_("Power Reserve"),
        "objective": N_("Defend the substation HQ"),
        "briefing": N_("Hostile columns are striking the power substation HQ from alternating directions with jammer and artillery support. Answer each wave from the central yard before the perimeter collapses."),
        "layout": N_("A central repair yard requires rapid responses to alternating attack directions."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":13,"phase":"regular"},{"type":"SAPPER","count":6,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"STRIKER","count":5,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Rotate jammers with sapper pushes; do not overlap jammer pressure with the largest striker wave."}
      },
      {
        "id": "campaign-29",
        "number": 29,
        "name": N_("Furnace District"),
        "objective": N_("Clear the steelworks"),
        "briefing": N_("Flamethrowers, howitzers, and engineers hold three offset casting yards in the steelworks. Use the four brick cuts and side exits to flank the furnaces without getting trapped."),
        "layout": N_("Three offset casting yards connect through short furnace passages. Converter and casting-house cover breaks the central exposure; four brick cuts and side exits preserve retreats."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":12,"phase":"regular"},{"type":"FLAMETHROWER","count":7,"phase":"regular"},{"type":"HOWITZER","count":5,"phase":"regular"},{"type":"ARMOR","count":5,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Alternate flame and artillery groups; engineers reinforce side lanes without sealing all exits."}
      },
      {
        "id": "campaign-30",
        "number": 30,
        "name": N_("Capital Breach"),
        "objective": N_("Destroy the perimeter stronghold"),
        "briefing": N_("A second MAMMOTH MK-V guards the Capital Breach behind three transverse defensive lines. Fight through the staging areas, neutralize the engineers, and bring down the stronghold and its boss."),
        "layout": N_("Three offset transverse defensive lines offer a short gate-breaching route and alternating west/east bypasses, with cover at each staging area."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":11,"phase":"regular"},{"type":"ENGINEER","count":4,"phase":"regular"},{"type":"ARMOR","count":8,"phase":"regular"},{"type":"STRIKER","count":6,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"BOSS_MAMMOTH","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Use armor for the main breach and strikers on flanks; Mammoth MK-V deploys when the garrison falls or the citadel core is breached."}
      }
    ]
  },
  {
    "id": "capital",
    "name": N_("Capital city"),
    "color": "#dda4a1",
    "missions": [
      {
        "id": "campaign-31",
        "number": 31,
        "name": N_("Return to the Streets"),
        "objective": N_("Clear the capital outskirts"),
        "briefing": N_("Urban blocks divide the capital outskirts into a sheltered western arcade and an exposed eastern tramway. Use the cross-streets and market partition to flank jammers and stealth tanks."),
        "layout": N_("Unequal city blocks form a sheltered western arcade and an exposed eastern tramway, linked by cross-streets and a destructible market partition."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":12,"phase":"regular"},{"type":"ARMOR","count":7,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Revisit city tactics with small stealth groups; retain lower density than the industrial finale."}
      },
      {
        "id": "campaign-32",
        "number": 32,
        "name": N_("Boulevard of Steel"),
        "objective": N_("Destroy the boulevard stronghold"),
        "briefing": N_("Engineers, howitzers, and heavy armor fortify the main boulevard. Bypass the heaviest kill zones through the two destructible side-block routes and level the stronghold."),
        "layout": N_("A fortified avenue is balanced by two destructible side-block routes."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":12,"phase":"regular"},{"type":"HOWITZER","count":6,"phase":"regular"},{"type":"ENGINEER","count":4,"phase":"regular"},{"type":"ARMOR","count":5,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Artillery holds the boulevard while engineers reinforce side blocks; both flanks remain breachable."}
      },
      {
        "id": "campaign-33",
        "number": 33,
        "name": N_("Last Shelter"),
        "objective": N_("Defend the civic HQ"),
        "briefing": N_("Relentless waves of strikers, flamethrowers, sappers, and kamikazes are converging on our last civic HQ. Hold your fallback positions and intercept explosive threats before they reach the base."),
        "layout": N_("The final defense mission combines staggered assaults and protected fallback positions."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":11,"phase":"regular"},{"type":"STRIKER","count":7,"phase":"regular"},{"type":"SAPPER","count":5,"phase":"regular"},{"type":"FLAMETHROWER","count":4,"phase":"regular"},{"type":"KAMIKAZE","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Use short alternating waves; at most two kamikazes appear together, never alongside a full flame group."}
      },
      {
        "id": "campaign-34",
        "number": 34,
        "name": N_("Citadel Ring"),
        "objective": N_("Destroy the inner stronghold"),
        "briefing": N_("Armored divisions, stealth units, and howitzers defend the concentric Citadel Ring. Use the ring road to flank each defensive layer and shatter the inner stronghold."),
        "layout": N_("A ring road supports flanking across successive defensive layers without requiring hover."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":11,"phase":"regular"},{"type":"ARMOR","count":8,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"STEALTH","count":5,"phase":"regular"},{"type":"HOWITZER","count":4,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Layer armor, stealth, and jammer encounters; avoid simultaneous saturation of every ring-road exit."}
      },
      {
        "id": "campaign-35",
        "number": 35,
        "name": N_("Vanguard Dawn"),
        "objective": N_("Clear the capital citadel"),
        "briefing": N_("The final assault on the Capital Citadel. Clear the garrison, survive the All-Boss Escalation, and get behind Supreme Dreadnought TITAN to pierce its directional Aegis armor."),
        "layout": N_("A ruined civic square provides cover breaks and full flanking space for the final Titan encounter."),
        "difficulty": N_("Campaign finale"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":11,"phase":"regular"},{"type":"STANDARD","count":1,"phase":"bossEscort"},{"type":"ARMOR","count":8,"phase":"regular"},{"type":"ARMOR","count":1,"phase":"bossEscort"},{"type":"STRIKER","count":4,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"BOSS_TITAN","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"Clear 29 regular tanks, then survive the All-Boss Escalation: Mammoth MK-V -> Hydra MLRS-9 + Cerberus-T -> Supreme Dreadnought Titan (with its 60% HP escort)."}
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
