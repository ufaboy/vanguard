/** Campaign missions, sector definitions, and progression trees. */
import { N_ } from '../i18n/index.js';

export const CAMPAIGN_CHAPTERS = [
  {
    "id": "italy",
    "name": N_("Italy"),
    "color": "#d6e7a0",
    "missions": [
      {
        "id": "campaign-01",
        "number": 1,
        "name": N_("Rome: Forum & Colosseum"),
        "objective": N_("Clear the Consortium strike teams before they regroup"),
        "briefing": N_("Interlocking urban loops replace the exposed central firing lane. A temple court, a residential block on the bent avenue and the Colosseum shell split the middle into short fights with cross streets and two-sided exits. Patrols cross between the Forum and the avenue instead of following parallel perimeter lanes. The second group brings the single howitzer; four supply pockets reward moving north and across flanks."),
        "layout": N_("Interlocking urban loops replace the exposed central firing lane. A temple court, a residential block on the bent avenue and the Colosseum shell split the middle into short fights with cross streets and two-sided exits. Patrols cross between the Forum and the avenue instead of following parallel perimeter lanes. The second group brings the single howitzer; four supply pockets reward moving north and across flanks."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":14,"phase":"regular"},{"type":"SCOUT","count":5,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-02",
        "number": 2,
        "name": N_("Apennine Gorge"),
        "objective": N_("Defend the field workshop HQ"),
        "briefing": N_("Hold the southern field workshop HQ across a narrow Apennine river gorge with one central stone bridge, two dry stony fords, and four destructible retaining-wall breaches that reward active lateral rotations."),
        "layout": N_("Hold the southern field workshop HQ across a narrow Apennine river gorge with one central stone bridge, two dry stony fords, and four destructible retaining-wall breaches that reward active lateral rotations."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"SAPPER","count":3,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-03",
        "number": 3,
        "name": N_("Milan Industrial"),
        "objective": N_("Destroy the Consortium tech hub"),
        "briefing": N_("Push north through Milan industrial corridors—along the Naviglio canal towpath, the central rail sidings, or the eastern sawtooth factories—to breach the Consortium tech hub."),
        "layout": N_("Push north through Milan industrial corridors—along the Naviglio canal towpath, the central rail sidings, or the eastern sawtooth factories—to breach the Consortium tech hub."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":8,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-04",
        "number": 4,
        "name": N_("Lake Garda & Verona"),
        "objective": N_("Hunt the convoy escorts along the lakeshore road and breach Verona"),
        "briefing": N_("Three distinct north-south corridors — the curving Gardesana lakeshore road, the cypress-lined villa lanes, and Verona’s walled eastern avenue — converge on the southern HQ. Break through the lakeshore customs wall or the Roman Arena brick ring to flank howitzers and convoy escorts."),
        "layout": N_("Three distinct north-south corridors — the curving Gardesana lakeshore road, the cypress-lined villa lanes, and Verona’s walled eastern avenue — converge on the southern HQ. Break through the lakeshore customs wall or the Roman Arena brick ring to flank howitzers and convoy escorts."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":7,"phase":"regular"},{"type":"STANDARD","count":11,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-05",
        "number": 5,
        "name": N_("Dolomites Pass"),
        "objective": N_("Destroy the Consortium pass fort"),
        "briefing": N_("Climb the switchback mountain road, flank through conifer-covered scree, or blast through rubble slides to storm the Consortium concrete fort blocking the Austrian border."),
        "layout": N_("Climb the switchback mountain road, flank through conifer-covered scree, or blast through rubble slides to storm the Consortium concrete fort blocking the Austrian border."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":16,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":4,"notes":"3 encounters"}
      }
    ]
  },
  {
    "id": "alps",
    "name": N_("Alps"),
    "color": "#86efac",
    "missions": [
      {
        "id": "campaign-06",
        "number": 6,
        "name": N_("Füssen & Neuschwanstein"),
        "objective": N_("Destroy the castle command core"),
        "briefing": N_("Assault the fortified castle hill via the central road, the Alpsee lakeside forest, or the Pöllat gorge bridge, then breach the curtain wall."),
        "layout": N_("Assault the fortified castle hill via the central road, the Alpsee lakeside forest, or the Pöllat gorge bridge, then breach the curtain wall."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":10,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":7,"notes":"3 encounters"}
      },
      {
        "id": "campaign-07",
        "number": 7,
        "name": N_("Innsbruck Rail Tunnel"),
        "objective": N_("Storm the fortified rail depot"),
        "briefing": N_("Cross the Inn River bridges and storm the Consortium rail yard and tunnel-mouth depot through conifer-screened alpine flanks, gravel rail sidings, and brick sally-gate breaches."),
        "layout": N_("Cross the Inn River bridges and storm the Consortium rail yard and tunnel-mouth depot through conifer-screened alpine flanks, gravel rail sidings, and brick sally-gate breaches."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":8,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-08",
        "number": 8,
        "name": N_("Hohensalzburg Fortress"),
        "objective": N_("Hold the Old Town HQ against counter-attacks from the fortress hill"),
        "briefing": N_("Defend Salzburg Old Town across three Salzach crossings—West Bridge, Staatsbrucke, and the East Ford—while using Old Town alleyways and breachable courtyard walls to flank fortress counterattacks."),
        "layout": N_("Defend Salzburg Old Town across three Salzach crossings—West Bridge, Staatsbrucke, and the East Ford—while using Old Town alleyways and breachable courtyard walls to flank fortress counterattacks."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-09",
        "number": 9,
        "name": N_("Wachau: Danube Valley"),
        "objective": N_("Eliminate Consortium patrols along the Danube terraces and abbey road"),
        "briefing": N_("Three distinct crossings over the winding Danube — the Melk Abbey stone bridge, the central Dürnstein gravel ford, and the eastern Krems bridge — connect wooded hills in the north to terraced vineyards in the south. Breach the abbey postern, ferry barricade, vineyard wall, or depot gate to flank artillery and amphibious patrols."),
        "layout": N_("Three distinct crossings over the winding Danube — the Melk Abbey stone bridge, the central Dürnstein gravel ford, and the eastern Krems bridge — connect wooded hills in the north to terraced vineyards in the south. Breach the abbey postern, ferry barricade, vineyard wall, or depot gate to flank artillery and amphibious patrols."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":2,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-10",
        "number": 10,
        "name": N_("Vienna: Hofburg"),
        "objective": N_("Break the Consortium hold on the Ring before the convoy turns north"),
        "briefing": N_("Contest the grand Ringstrasse boulevards and Heldenplatz statues, or use the Volksgarten-Burggarten parks and three destructible breaches to flank Consortium artillery and jammers."),
        "layout": N_("Contest the grand Ringstrasse boulevards and Heldenplatz statues, or use the Volksgarten-Burggarten parks and three destructible breaches to flank Consortium artillery and jammers."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      }
    ]
  },
  {
    "id": "bohemia",
    "name": N_("Bohemia & Saxony"),
    "color": "#fcd34d",
    "missions": [
      {
        "id": "campaign-11",
        "number": 11,
        "name": N_("Moravian Karst"),
        "objective": N_("Flush out enemy units around the Macocha Abyss"),
        "briefing": N_("Split around the impassable Macocha Abyss through dense karst woodland, narrow ravine roads, and concrete-lined cave mouths."),
        "layout": N_("Split around the impassable Macocha Abyss through dense karst woodland, narrow ravine roads, and concrete-lined cave mouths."),
        "difficulty": N_("Medium"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"STEALTH","count":3,"phase":"regular"},{"type":"FLAMETHROWER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-12",
        "number": 12,
        "name": N_("Konopiště Castle"),
        "objective": N_("Breach the castle and destroy the Consortium document depot"),
        "briefing": N_("Assault Konopiště Castle on its wooded hill via the central pond causeway, the western Obora deer park, or the eastern estate road, then breach the curtain wall."),
        "layout": N_("Assault Konopiště Castle on its wooded hill via the central pond causeway, the western Obora deer park, or the eastern estate road, then breach the curtain wall."),
        "difficulty": N_("Medium"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-13",
        "number": 13,
        "name": N_("Prague: Charles Bridge"),
        "objective": N_("Clear the Charles Bridge crossings"),
        "briefing": N_("A first battle over the Vltava: hold the Old Town bank while columns come down from Mala Strana over Charles Bridge, the modern road bridge and the Kampa channel. Fuel drums, collapsing houses, hovercraft and a lone howitzer show what the battlefield can do."),
        "layout": N_("A first battle over the Vltava: hold the Old Town bank while columns come down from Mala Strana over Charles Bridge, the modern road bridge and the Kampa channel. Fuel drums, collapsing houses, hovercraft and a lone howitzer show what the battlefield can do."),
        "difficulty": N_("Medium"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":14,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":5,"maxConcurrent":5,"notes":"5 encounters"}
      },
      {
        "id": "campaign-14",
        "number": 14,
        "name": N_("Bohemian Forest"),
        "objective": N_("Hold the forest crossroads camp at dawn against flanking patrols"),
        "briefing": N_("Hold a rain-soaked Bohemian Forest crossroads camp at dawn, rotating between three logging corridors separated by dense spruce groves and peat bogs."),
        "layout": N_("Hold a rain-soaked Bohemian Forest crossroads camp at dawn, rotating between three logging corridors separated by dense spruce groves and peat bogs."),
        "difficulty": N_("Medium"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"STEALTH","count":4,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":3,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-15",
        "number": 15,
        "name": N_("Dresden & the Elbe"),
        "objective": N_("Destroy all Consortium forces and defeat the Mammoth dreadnought guarding the Elbe"),
        "briefing": N_("Cross the Elbe via Augustus Bridge, Marienbrücke, or the eastern sand fords to clear Consortium artillery in the meadows and prepare an open-ground ambush for the Mammoth dreadnought."),
        "layout": N_("Cross the Elbe via Augustus Bridge, Marienbrücke, or the eastern sand fords to clear Consortium artillery in the meadows and prepare an open-ground ambush for the Mammoth dreadnought."),
        "difficulty": N_("Boss sector"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"BOSS_MAMMOTH","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      }
    ]
  },
  {
    "id": "germany",
    "name": N_("Germany"),
    "color": "#67e8f9",
    "missions": [
      {
        "id": "campaign-16",
        "number": 16,
        "name": N_("Berlin: Brandenburg Gate"),
        "objective": N_("Clear the Tiergarten approaches"),
        "briefing": N_("A light second battle in a beautiful, intact Berlin: columns come out of the Tiergarten woods past the Victory Column and the Reichstag toward the Brandenburg Gate and Unter den Linden. The Gate splits the direct road into three passages, the woods and Ministergaerten give a covered west detour, and the embassy courtyards open an east shortcut."),
        "layout": N_("A light second battle in a beautiful, intact Berlin: columns come out of the Tiergarten woods past the Victory Column and the Reichstag toward the Brandenburg Gate and Unter den Linden. The Gate splits the direct road into three passages, the woods and Ministergaerten give a covered west detour, and the embassy courtyards open an east shortcut."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":5,"phase":"regular"},{"type":"STANDARD","count":13,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"},{"type":"ARMOR","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":5,"maxConcurrent":5,"notes":"4 encounters"}
      },
      {
        "id": "campaign-17",
        "number": 17,
        "name": N_("Berlin: Reichstag & Spree"),
        "objective": N_("Cross the Spree and destroy the Consortium command post in the Reichstag"),
        "briefing": N_("Assault the fortified Consortium command post inside the Reichstag across the Spree river bend. Three bridges and two shallow sand fords cross the Spree toward the Platz der Republik lawn, the Victory Column in the Tiergarten woods, and the Friedrichstrasse ministry courtyards."),
        "layout": N_("Assault the fortified Consortium command post inside the Reichstag across the Spree river bend. Three bridges and two shallow sand fords cross the Spree toward the Platz der Republik lawn, the Victory Column in the Tiergarten woods, and the Friedrichstrasse ministry courtyards."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-18",
        "number": 18,
        "name": N_("East Berlin Rail Yards"),
        "objective": N_("Destroy the Consortium blueprint vault"),
        "briefing": N_("Advance north across the former Berlin Wall border strip through three distinct industrial corridors: the derelict western factory yards with overgrown scrub, the central Ostbahnhof freight rail spine with fuel sidings and the water tower, or the eastern warehouse alleys with brick breach partitions."),
        "layout": N_("Advance north across the former Berlin Wall border strip through three distinct industrial corridors: the derelict western factory yards with overgrown scrub, the central Ostbahnhof freight rail spine with fuel sidings and the water tower, or the eastern warehouse alleys with brick breach partitions."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-19",
        "number": 19,
        "name": N_("Harz Mountains"),
        "objective": N_("Hunt down the Consortium convoy scouts across the Brocken slopes"),
        "briefing": N_("Hunt mobile convoy scouts across the wooded Brocken slopes along three distinct corridors: a granite-rimmed western logging road, the central Brockenbahn narrow-gauge rail cut past the mountain station, and an eastern valley timber road."),
        "layout": N_("Hunt mobile convoy scouts across the wooded Brocken slopes along three distinct corridors: a granite-rimmed western logging road, the central Brockenbahn narrow-gauge rail cut past the mountain station, and an eastern valley timber road."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":5,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"STEALTH","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-20",
        "number": 20,
        "name": N_("Remagen Bridgehead"),
        "objective": N_("Hold the Remagen bridgehead"),
        "briefing": N_("Hold the Remagen bank of the Rhine against counterattacks over three crossings that no single position can watch: the Ludendorff railway bridge, a western treadway through the floodplain wood, and an eastern treadway below the Erpeler Ley. Promenade villas, orchards and town gardens break the sightlines and hide ambush positions, so the defence has to rotate."),
        "layout": N_("Hold the Remagen bank of the Rhine against counterattacks over three crossings that no single position can watch: the Ludendorff railway bridge, a western treadway through the floodplain wood, and an eastern treadway below the Erpeler Ley. Promenade villas, orchards and town gardens break the sightlines and hide ambush positions, so the defence has to rotate."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":9,"phase":"regular"},{"type":"HOVER","count":4,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-21",
        "number": 21,
        "name": N_("Ruhr: Coal & Steel"),
        "objective": N_("Clear the steelworks and defeat Cerberus-T"),
        "briefing": N_("Fight through a fortified Ruhr steelworks with a central blast-furnace spine, western coal yard, and eastern barge-canal bridge, then use brick partitions, concrete furnace piers, and outer birch scrub to kite Cerberus-T's 2.5-cell thermobaric blasts and overdrive rams."),
        "layout": N_("Fight through a fortified Ruhr steelworks with a central blast-furnace spine, western coal yard, and eastern barge-canal bridge, then use brick partitions, concrete furnace piers, and outer birch scrub to kite Cerberus-T's 2.5-cell thermobaric blasts and overdrive rams."),
        "difficulty": N_("Boss sector"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":3,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"},{"type":"BOSS_INFERNO","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      }
    ]
  },
  {
    "id": "low_countries",
    "name": N_("Low Countries"),
    "color": "#a5b4fc",
    "missions": [
      {
        "id": "campaign-22",
        "number": 22,
        "name": N_("Amsterdam Canals"),
        "objective": N_("Chase and destroy all Consortium units across the Amsterdam canal ring"),
        "briefing": N_("Pursue mobile Consortium forces through Amsterdam's concentric Grachtengordel canals, narrow quays, and gabled canal-house blocks across seven canal bridges, Westerkerk square, and Dam Square."),
        "layout": N_("Pursue mobile Consortium forces through Amsterdam's concentric Grachtengordel canals, narrow quays, and gabled canal-house blocks across seven canal bridges, Westerkerk square, and Dam Square."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":12,"phase":"regular"},{"type":"HOWITZER","count":5,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-23",
        "number": 23,
        "name": N_("Rotterdam Europoort"),
        "objective": N_("Seize the prototype crates and destroy the terminal stronghold"),
        "briefing": N_("Assault the fortified Europoort container terminal from the southern marshaling apron across three distinct port corridors: the western Maashaven container quay and bridge, the central gantry-crane freight spine with breachable container stacks, and the eastern oil tank farm and barge slip."),
        "layout": N_("Assault the fortified Europoort container terminal from the southern marshaling apron across three distinct port corridors: the western Maashaven container quay and bridge, the central gantry-crane freight spine with breachable container stacks, and the eastern oil tank farm and barge slip."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":4,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-24",
        "number": 24,
        "name": N_("Brussels: Cinquantenaire"),
        "objective": N_("Destroy the enemy HQ behind the arch"),
        "briefing": N_("A light assault across Brussels on a clear autumn day: leave the Grand-Place, cross the Parc de Bruxelles past the Royal Palace and storm the command post hidden behind the Cinquantenaire arch. Mostly light tanks; a heavy guard and a howitzer hold the arch."),
        "layout": N_("A light assault across Brussels on a clear autumn day: leave the Grand-Place, cross the Parc de Bruxelles past the Royal Palace and storm the command post hidden behind the Cinquantenaire arch. Mostly light tanks; a heavy guard and a howitzer hold the arch."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":11,"phase":"regular"},{"type":"SCOUT","count":6,"phase":"regular"},{"type":"ARMOR","count":2,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":4,"notes":"4 encounters"}
      },
      {
        "id": "campaign-25",
        "number": 25,
        "name": N_("Antwerp Docks"),
        "objective": N_("Hold the Antwerp dock workshop against the Consortium landing"),
        "briefing": N_("Defend the southern dock workshop across two Scheldt dock basins and three lock crossings: a central haul pier, a western lock bridge past fuel depots, and an eastern rail-siding lock. Warehouses, brick yard walls, and quay scrub break sightlines so no single position can watch all three approaches."),
        "layout": N_("Defend the southern dock workshop across two Scheldt dock basins and three lock crossings: a central haul pier, a western lock bridge past fuel depots, and an eastern rail-siding lock. Warehouses, brick yard walls, and quay scrub break sightlines so no single position can watch all three approaches."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"HOVER","count":5,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-26",
        "number": 26,
        "name": N_("Scheldt Delta Dams"),
        "objective": N_("Clear the delta barrier defenses and defeat Hydra"),
        "briefing": N_("Assault a coastal storm-surge barrier and reclaimed polder network across the Scheldt Delta. Wide open estuary basins let hover packs and the amphibious Hydra MLRS-9 rocket cruiser strike from the water, while four dry causeways, sluice bridges, dune windbreaks, and destructible floodgate bulkheads give tracked armor covered approaches and flanking cuts."),
        "layout": N_("Assault a coastal storm-surge barrier and reclaimed polder network across the Scheldt Delta. Wide open estuary basins let hover packs and the amphibious Hydra MLRS-9 rocket cruiser strike from the water, while four dry causeways, sluice bridges, dune windbreaks, and destructible floodgate bulkheads give tracked armor covered approaches and flanking cuts."),
        "difficulty": N_("Boss sector"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":5,"phase":"regular"},{"type":"HOVER","count":7,"phase":"regular"},{"type":"SCOUT","count":2,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"ARMOR","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"BOSS_HYDRA","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      }
    ]
  },
  {
    "id": "france",
    "name": N_("France"),
    "color": "#fca5a5",
    "missions": [
      {
        "id": "campaign-27",
        "number": 27,
        "name": N_("Paris: Champs-Élysées"),
        "objective": N_("Break the Consortium column on the avenue between the Arc de Triomphe and Place de la Concorde"),
        "briefing": N_("A capital-district battle along the Axe Historique from the Arc de Triomphe to Place de la Concorde. The grand avenue is broken by the Rond-Point fountain island and war barricades, flanked by the wooded Jardins des Champs-Élysées and Grand Palais to the west, Haussmannian side streets to the east, and the Seine with three bridges leading to the Eiffel Tower on the Left Bank."),
        "layout": N_("A capital-district battle along the Axe Historique from the Arc de Triomphe to Place de la Concorde. The grand avenue is broken by the Rond-Point fountain island and war barricades, flanked by the wooded Jardins des Champs-Élysées and Grand Palais to the west, Haussmannian side streets to the east, and the Seine with three bridges leading to the Eiffel Tower on the Left Bank."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-28",
        "number": 28,
        "name": N_("Versailles"),
        "objective": N_("Defend the palace HQ"),
        "briefing": N_("A light defence of the Palace of Versailles in late spring: columns cross the park around the Grand Canal, the bosquets and the Trianon and must go around the palace to reach the HQ in the Marble Court. Each wave brings one new enemy kind: a sapper, a flamethrower and a stealth tank in the groves, a jammer, then a kamikaze."),
        "layout": N_("A light defence of the Palace of Versailles in late spring: columns cross the park around the Grand Canal, the bosquets and the Trianon and must go around the palace to reach the HQ in the Marble Court. Each wave brings one new enemy kind: a sapper, a flamethrower and a stealth tank in the groves, a jammer, then a kamikaze."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":6,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"STANDARD","count":11,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"KAMIKAZE","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":5,"notes":"5 encounters"}
      },
      {
        "id": "campaign-29",
        "number": 29,
        "name": N_("Lyon Industrial"),
        "objective": N_("Destroy the Consortium refit line and chemical corridor stronghold"),
        "briefing": N_("Push north up the Lyon Chemical Corridor along three distinct approaches: the western Rhone bank and bridges, the central Consortium refit halls, and the eastern refinery tank farm and rail siding, breaking through brick containment bunds to reach the fortified refit line."),
        "layout": N_("Push north up the Lyon Chemical Corridor along three distinct approaches: the western Rhone bank and bridges, the central Consortium refit halls, and the eastern refinery tank farm and rail siding, breaking through brick containment bunds to reach the fortified refit line."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":4,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-30",
        "number": 30,
        "name": N_("Mont Blanc"),
        "objective": N_("Destroy the Consortium radar station on the high col"),
        "briefing": N_("Ascend the glaciated Mont Blanc approaches across bridged crevasses and stone moraines, using conifer ambush pockets and breachable avalanche barriers to storm the fortified radar station on the high col."),
        "layout": N_("Ascend the glaciated Mont Blanc approaches across bridged crevasses and stone moraines, using conifer ambush pockets and breachable avalanche barriers to storm the fortified radar station on the high col."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-31",
        "number": 31,
        "name": N_("Provence Lavender"),
        "objective": N_("Hunt down enemy snipers and scouts across the lavender fields"),
        "briefing": N_("Flush snipers, scouts, and stealth tanks out of parallel lavender hedge rows and stone-walled village lanes while crossing the dry riverbed to flank long-range fire."),
        "layout": N_("Flush snipers, scouts, and stealth tanks out of parallel lavender hedge rows and stone-walled village lanes while crossing the dry riverbed to flank long-range fire."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":5,"phase":"regular"},{"type":"STANDARD","count":8,"phase":"regular"},{"type":"STEALTH","count":4,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"ARMOR","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-32",
        "number": 32,
        "name": N_("Nice: Côte d'Azur"),
        "objective": N_("Clear Consortium coastal forces and defeat the rebuilt Mammoth dreadnought"),
        "briefing": N_("Fight through the palm-lined Promenade des Anglais, the narrow alleys of Vieux Nice, and the yacht piers of Port Lympia. Break coastal barricades to flank artillery batteries before facing the rebuilt Mammoth MK-V dreadnought."),
        "layout": N_("Fight through the palm-lined Promenade des Anglais, the narrow alleys of Vieux Nice, and the yacht piers of Port Lympia. Break coastal barricades to flank artillery batteries before facing the rebuilt Mammoth MK-V dreadnought."),
        "difficulty": N_("Boss sector"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":4,"phase":"regular"},{"type":"HOVER","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"BOSS_MAMMOTH","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      }
    ]
  },
  {
    "id": "pyrenees",
    "name": N_("Pyrenees & Catalonia"),
    "color": "#f472b6",
    "missions": [
      {
        "id": "campaign-33",
        "number": 33,
        "name": N_("Andorra: Pas de la Casa"),
        "objective": N_("Hold the Pas de la Casa resort HQ against snowbound assault columns"),
        "briefing": N_("Defend the southern Pas de la Casa resort HQ against multi-column armored assaults descending the CG-2 Pyrenean pass road, the Grandvalira ski pistes, and the eastern conifer ridge. Use ski-lift pylons, resort chalets, and breachable snow-shed walls to intercept sappers and flank long-range artillery."),
        "layout": N_("Defend the southern Pas de la Casa resort HQ against multi-column armored assaults descending the CG-2 Pyrenean pass road, the Grandvalira ski pistes, and the eastern conifer ridge. Use ski-lift pylons, resort chalets, and breachable snow-shed walls to intercept sappers and flank long-range artillery."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":3,"phase":"regular"},{"type":"ARMOR","count":6,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"STRIKER","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"KAMIKAZE","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-34",
        "number": 34,
        "name": N_("Bardenas Reales Range"),
        "objective": N_("Ambush and destroy the Consortium column on the Bardenas military range"),
        "briefing": N_("Ambush a Consortium armoured column across the semi-desert Bardenas military range by using dry gullies, scrub pockets, and firing-range bunkers to flank long-range fire."),
        "layout": N_("Ambush a Consortium armoured column across the semi-desert Bardenas military range by using dry gullies, scrub pockets, and firing-range bunkers to flank long-range fire."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":11,"phase":"regular"},{"type":"STEALTH","count":5,"phase":"regular"},{"type":"ARMOR","count":8,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"HOWITZER","count":4,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-35",
        "number": 35,
        "name": N_("Montserrat"),
        "objective": N_("Capture the Consortium observation post on Montserrat"),
        "briefing": N_("Ascend the serrated limestone massif of Montserrat via the western crag gorge, the central mountain switchback, or the eastern monastery terraces and funicular spine to breach the Consortium observation post."),
        "layout": N_("Ascend the serrated limestone massif of Montserrat via the western crag gorge, the central mountain switchback, or the eastern monastery terraces and funicular spine to breach the Consortium observation post."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-36",
        "number": 36,
        "name": N_("Barcelona: Gothic Quarter & Sagrada Família"),
        "objective": N_("Destroy all Consortium forces between the Gothic Quarter, Eixample, and Sagrada Família"),
        "briefing": N_("Asymmetric urban battleground contrasting the tight medieval alleys of the Gothic Quarter and tree-lined La Rambla in the west against the chamfered octagonal Eixample blocks in the east, anchored by the Sagrada Familia basilica complex in the center."),
        "layout": N_("Asymmetric urban battleground contrasting the tight medieval alleys of the Gothic Quarter and tree-lined La Rambla in the west against the chamfered octagonal Eixample blocks in the east, anchored by the Sagrada Familia basilica complex in the center."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"FLAMETHROWER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-37",
        "number": 37,
        "name": N_("Barcelona: Montjuic"),
        "objective": N_("Silence the Montjuic coastal guns and capture the castle stronghold"),
        "briefing": N_("Assault the fortified Montjuic Castle and coastal battery from the southern approaches across three distinct corridors: the western Olympic Ring and pine parklands, the central hill terraces and castle sally gate, and the eastern Mediterranean cliffside coastal road."),
        "layout": N_("Assault the fortified Montjuic Castle and coastal battery from the southern approaches across three distinct corridors: the western Olympic Ring and pine parklands, the central hill terraces and castle sally gate, and the eastern Mediterranean cliffside coastal road."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"HOVER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-38",
        "number": 38,
        "name": N_("Barcelona: Port"),
        "objective": N_("Clear the port defenders and defeat the surviving Sector Bosses and Titan"),
        "briefing": N_("Fight through the Port of Barcelona container terminal, gantry crane quays, and Columbus Monument plaza against 24 elite port defenders, then survive the All-Boss Escalation culminating in the Supreme Dreadnought Titan."),
        "layout": N_("Fight through the Port of Barcelona container terminal, gantry crane quays, and Columbus Monument plaza against 24 elite port defenders, then survive the All-Boss Escalation culminating in the Supreme Dreadnought Titan."),
        "difficulty": N_("Campaign finale"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"BOSS_TITAN","count":1,"phase":"boss"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
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
