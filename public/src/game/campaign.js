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
        "briefing": N_("Two thousand years ago empires were decided here; today Kranz's strike teams have seized four Prometheus prototypes on Via dei Fori Imperiali and are covering the convoy's escape north. Vanguard-1, break their perimeter around the Forum and Colosseum before the dust settles—clearing Rome restores satellite tracking and opens the pursuit into the Apennines."),
        "layout": N_("Interlocking urban loops through the Roman Forum, the Arch of Constantine, a bent imperial avenue lined with umbrella pines, and the Colosseum square. Tight stone ruins create crossfire lanes with three destructible breaches and a howitzer covering the central approach."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":14,"phase":"regular"},{"type":"SCOUT","count":5,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-02",
        "number": 2,
        "name": N_("Apennine Gorge"),
        "objective": N_("Hold the field workshop HQ against Consortium counterattacks"),
        "briefing": N_("Pursuing the convoy north, Vanguard's spearhead outruns its support and sets up a field workshop at the only heavy crossing through the Apennines. Realizing our vanguard is exposed, Kranz's rearguard wheels around to crush the base and seal the gorge behind them. Hold the bridge and river ford—saving the workshop keeps the chase alive toward Milan."),
        "layout": N_("A narrow mountain canyon with steep rock ledges and scree chutes funneling armor onto one central stone bridge and a shallow downstream ford. Four destructible retaining-wall breaches allow active lateral rotations between approaches."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"SAPPER","count":3,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-03",
        "number": 3,
        "name": N_("Milan Industrial"),
        "objective": N_("Breach the industrial perimeter and destroy the central relay hub"),
        "briefing": N_("Oracle detects dozens of phantom convoy signals flooding Northern Italy from Milan's factory belt, where the Consortium has hidden a spoofing and relay hub. We don't need to take the whole city—punch through the old workshops by the Naviglio canal and burn out their central relay node to unmask the real convoy route toward Lake Garda."),
        "layout": N_("Dense industrial maze of sawtooth-roof workshops, rail sidings, and the Naviglio canal towpath with the silhouette of Milan Cathedral on the distant horizon. Tight factory corridors favor ambushes and quick flanking cuts."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":8,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-04",
        "number": 4,
        "name": N_("Lake Garda & Verona"),
        "objective": N_("Eliminate all Consortium escort units along the lakefront and Verona"),
        "briefing": N_("With the Milan jammer dead, Vanguard catches the Consortium's escort screen on the eastern shore of Lake Garda outside Verona, guarding the Adige valley road into the Alps. Beneath Garda's deceptive blue water, every cypress bend hides an ambush. Wipe out their escort at the water's edge before the heavy transporters climb out of reach."),
        "layout": N_("Lake Garda seals one flank with open water, compressing the battle onto a narrow coastal highway, cypress groves, lakeside villages, and Verona's ancient brick walls and Roman Arena."),
        "difficulty": N_("Low"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":7,"phase":"regular"},{"type":"STANDARD","count":11,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-05",
        "number": 5,
        "name": N_("Dolomites Pass"),
        "objective": N_("Break through the switchbacks and destroy the pass fortress HQ"),
        "briefing": N_("Italy's final barrier: the main convoy has crossed the border, and Consortium sappers have collapsed the side trails, leaving one icy switchback under the guns of a concrete fortress. No detours remain—smash through the high pass, shatter Kranz's fortified HQ, and carry the pursuit into Bavaria and Austria."),
        "layout": N_("High-altitude snow and ice switchbacks framed by pale Dolomite cliffs and rockslide barriers leading straight to a concrete summit stronghold. Slippery ice reduces traction and offers scant cover on the ascent."),
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
        "objective": N_("Storm the castle ridge and destroy the Consortium command core"),
        "briefing": N_("Kranz loves grand symbols—he has turned Neuschwanstein Castle above Füssen into his Western Alps command post, coordinating prototype rail transfers toward Innsbruck. Cross the Pöllat gorge, climb through the steep forest, and crack the castle HQ to seize his train schedules."),
        "layout": N_("Dense conifer slopes rising above Lake Alpsee toward the fortified castle courtyard, with approaches channeled across the narrow Pöllat gorge bridge, lakeside woods, and a breachable curtain wall."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":10,"phase":"regular"},{"type":"STANDARD","count":10,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":7,"notes":"3 encounters"}
      },
      {
        "id": "campaign-07",
        "number": 7,
        "name": N_("Innsbruck Rail Tunnel"),
        "objective": N_("Clear the station guard and capture the tunnel-mouth loading terminal"),
        "briefing": N_("Documents from Neuschwanstein confirm our worst fear: guidance and crypto modules stripped from the Roman prototypes are being loaded onto armored trains at the Brenner rail portals near Innsbruck. If those crates disappear underground, we lose them—storm the snowbound railyard and seize the tunnel-mouth terminal."),
        "layout": N_("Snow-covered marshaling yard in the Inn River valley terminating at concrete mountain tunnel portals. Rows of freight cars, gravel sidings, and brick sally gates form tight corridors prone to flanking fire."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":8,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-08",
        "number": 8,
        "name": N_("Hohensalzburg Fortress"),
        "objective": N_("Hold the Old Town HQ against counterattacks from the fortress hill"),
        "briefing": N_("They say Hohensalzburg Fortress has stood unconquered for a thousand years—today we don't need to take its walls, only survive beneath them. Kranz's garrison is pouring down Festungsberg toward Salzburg's Old Town to cut the Salzach bridges. Lock down the crossings and hold the riverfront to open the road to the Danube."),
        "layout": N_("Historic Altstadt quarters wedged between steep fortress cliffs and the wide Salzach River, linked by West Bridge, Staatsbrücke, and the East Ford. Narrow alleys and courtyard walls break long sightlines."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-09",
        "number": 9,
        "name": N_("Wachau: Danube Valley"),
        "objective": N_("Eliminate all Consortium patrols along the Danube terraces"),
        "briefing": N_("To buy hours for the convoy, the Consortium has turned the scenic Wachau gorge into a mobile ambush belt, hiding patrol companies among terraced vineyards and forested ridges beneath the abbey cliffs. Clear every last tank out of the valley—Vienna is within striking distance."),
        "layout": N_("Winding Danube river gorge with steep wooded hills, terraced vineyards, and a cliffside abbey. Three crossings—the Melk stone bridge, Dürnstein gravel ford, and Krems bridge—connect multi-level ambush terrain."),
        "difficulty": N_("Moderate"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":2,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-10",
        "number": 10,
        "name": N_("Vienna: Hofburg"),
        "objective": N_("Break the Consortium blockade on the Ringstrasse and Hofburg"),
        "briefing": N_("Kranz has outplayed our projections—while we fought through Wachau, his main convoy didn't head west; it turned sharply north toward Bohemia. His guard now holds Vienna's Ringstrasse and Heldenplatz to slam the door behind him. Smash the Vienna ring while the northern trail is still warm."),
        "layout": N_("Grand Ringstrasse boulevards, the wide Heldenplatz square before the Hofburg Neue Burg facade, city parks, and the spire of St. Stephen's Cathedral. Open plazas force long-range duels while palace wings hide flankers."),
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
        "objective": N_("Flush out all Consortium units around the Macocha Abyss"),
        "briefing": N_("North of Brno, the convoy's tracks lead into the limestone plateau of the Moravian Karst, where the Consortium built field bunkers at cave mouths to begin cracking the Roman quantum cores. Watch your treads around the 138-meter Macocha Abyss—smoke Kranz's crews out of their stone lairs to uncover their Bohemian archive."),
        "layout": N_("Dense karst woodland split by the impassable Macocha Abyss, steep limestone ravines, sinkholes, and concrete-lined cave bunkers that restrict movement to narrow gorge roads."),
        "difficulty": N_("Medium"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"STEALTH","count":3,"phase":"regular"},{"type":"FLAMETHROWER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-12",
        "number": 12,
        "name": N_("Konopiště Castle"),
        "objective": N_("Breach the castle gates and destroy the Consortium archive HQ"),
        "briefing": N_("Once a quiet residence where World War I began, Konopiště Castle now hides Kranz's weapon-integration blueprints for Project Titan. Storm the lakeside hill before they torch the vault—capturing this archive will reveal what monster they are building on the Elbe."),
        "layout": N_("Wooded hilltop castle surrounded by ponds, the Obora deer park, and multi-layered defenses funneling attackers across the central pond causeway toward narrow curtain-wall gates."),
        "difficulty": N_("Medium"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-13",
        "number": 13,
        "name": N_("Prague: Charles Bridge"),
        "objective": N_("Clear all Consortium forces from the Charles Bridge crossings"),
        "briefing": N_("The stone saints on Charles Bridge have witnessed centuries of war, but never armor like this. Kranz's rearguard is blocking the Vltava crossings to stall us for twenty-four hours while their heavy assembly finishes in Saxony. Sweep the bridges and riverbanks—we have no time for a siege."),
        "layout": N_("Dense historic Prague quarters along the Vltava, spanned by Charles Bridge, the modern road bridge, and the Kampa channel. Fuel drums, collapsing houses, and tight embankment approaches punish frontal charges."),
        "difficulty": N_("Medium"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":14,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"HOWITZER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":5,"maxConcurrent":5,"notes":"5 encounters"}
      },
      {
        "id": "campaign-14",
        "number": 14,
        "name": N_("Bohemian Forest"),
        "objective": N_("Hold the forest crossroads camp against the dawn ambush"),
        "briefing": N_("Dawn after a downpour, thirty meters of visibility in thick fog, and nothing around us but black Šumava spruce and peat bogs. Sensors detect Consortium hunter groups converging down all three logging roads to bury our refueling vanguard. Form an all-around perimeter and hold the camp until Saxony opens ahead."),
        "layout": N_("Rain-soaked mountain spruce forest and impassable peat bogs converging on a crossroads camp along three muddy logging corridors veiled in low fog."),
        "difficulty": N_("Medium"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"STEALTH","count":4,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":3,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-15",
        "number": 15,
        "name": N_("Dresden & the Elbe"),
        "objective": N_("Clear the Elbe crossings and defeat the Mammoth dreadnought"),
        "briefing": N_("Meet the first fruits of the Iron Road, Commander. Oracle decodes its designation: Mammoth—a super-heavy tracked dreadnought powered by the first cracked Prometheus core and armored like a fortress. It waits on the open Elbe meadows beyond Augustus Bridge. Show Kranz that even monsters burn—break Dresden to open the road to Berlin."),
        "layout": N_("Baroque Old Town with the Frauenkirche dome and Zwinger on the south bank, Augustus Bridge and Marienbrücke across the Elbe, and wide open northern meadows ideal for kiting a heavy boss."),
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
        "objective": N_("Break the Consortium guard line at the Brandenburg Gate"),
        "briefing": N_("We have reached the heart of Germany, and Kranz has thrown his best guard units across Berlin's central axis to buy time for his directorate behind the Spree to wipe their servers. There is no room for half-measures at the Brandenburg Gate—shatter the blockade and push straight into the government quarter."),
        "layout": N_("Monumental capital avenues converging on the Brandenburg Gate colonnade from the Tiergarten woods and Victory Column, flanked by covered Ministergärten detours and embassy courtyard shortcuts."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":5,"phase":"regular"},{"type":"STANDARD","count":13,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"},{"type":"ARMOR","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":5,"maxConcurrent":5,"notes":"4 encounters"}
      },
      {
        "id": "campaign-17",
        "number": 17,
        "name": N_("Berlin: Reichstag & Spree"),
        "objective": N_("Cross the Spree and destroy the Reichstag command post"),
        "briefing": N_("Beyond the Spree bend sits the nerve center of the Consortium's German network, already purging its drives before fleeing west. Force the river bridges, cross the open lawn before the Reichstag, and crush their command post while their East Berlin vault coordinates can still be recovered."),
        "layout": N_("Horseshoe Spree river bend crossed by three bridges and two shallow sand fords, opening onto the Platz der Republik lawn, glass-and-concrete ministry blocks, and the 62-meter Victory Column."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-18",
        "number": 18,
        "name": N_("East Berlin Rail Yards"),
        "objective": N_("Breach the Wall-strip depot and destroy the fortified blueprint vault"),
        "briefing": N_("Cold War ghosts still serve whoever pays. Behind graffiti-scarred remnants of the old Berlin Wall, Kranz hid his backup blueprint vault and the satellite relays synchronizing the Ruhr steelworks. Smash through the rusted rail yards and reduce that vault to ash before their columns escape through the Harz."),
        "layout": N_("Grim industrial strip along the former Berlin Wall border with overgrown western factory yards, the central Ostbahnhof freight rail spine and water tower, and eastern warehouse alleys."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-19",
        "number": 19,
        "name": N_("Harz Mountains"),
        "objective": N_("Hunt down all Consortium scouts and ambushers on the Brocken slopes"),
        "briefing": N_("Once a Cold War listening post, Mount Brocken now hides Kranz's scouts and artillery spotters guiding his retreating columns around our blocks. Comb the granite ridges along the narrow-gauge mountain railway—not one spotter can reach the Rhine ahead of us."),
        "layout": N_("Rugged spruce forest, ancient granite outcrops, and the winding Brockenbahn narrow-gauge rail cut climbing the slopes alongside twin logging roads."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":5,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"STEALTH","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"STRIKER","count":1,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-20",
        "number": 20,
        "name": N_("Remagen Bridgehead"),
        "objective": N_("Hold the Remagen Rhine bridgehead against Consortium counterattacks"),
        "briefing": N_("History repeats itself: Vanguard seized the Remagen Rhine crossing on the heels of their retreat, and now Kranz is throwing his entire western reserve at our bridgehead to stop us from reaching the Ruhr. Hold the Ludendorff bank, Commander—keep the Rhine open and Germany's industrial forge lies defenseless to the north."),
        "layout": N_("Narrow riverbank town squeezed between the swift Rhine and steep gorge cliffs, fed by the Ludendorff rail bridge and two flanking treadways; orchards and riverside villas break sightlines."),
        "difficulty": N_("Elevated"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":9,"phase":"regular"},{"type":"HOVER","count":4,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-21",
        "number": 21,
        "name": N_("Ruhr: Coal & Steel"),
        "objective": N_("Clear the steelworks garrison and destroy Cerberus-T"),
        "briefing": N_("The air smells of sulfur and scorched steel before a single shot is fired. Deep in the Ruhr blast furnaces, Kranz forged his second Sector Boss: Cerberus-T, a thermobaric leviathan fed by the second Roman core whose fuel-air shells burn concrete and forest to bare sand. Keep moving, never linger behind cover, and put that furnace out for good."),
        "layout": N_("Industrial complex of blast furnaces, western coal yards, overhead conveyor bridges, slag heaps, and an eastern barge-canal bridge where walls and woods can be scorched away by thermobaric fire."),
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
        "objective": N_("Intercept and destroy all Consortium units in the canal ring"),
        "briefing": N_("Stripped of his German factories, Kranz is racing to evacuate the prototypes through North Sea ports. His rearguard splintered into Amsterdam's concentric canals, turning every narrow brick bridge into a kill box beneath the Westerkerk tower. Box them in along the quays before they reach Rotterdam."),
        "layout": N_("Concentric Grachtengordel canal rings, narrow brick quays, seven tight canal bridges, gabled merchant blocks, and Dam and Westerkerk squares that severely restrict lateral movement."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":4,"phase":"regular"},{"type":"STANDARD","count":12,"phase":"regular"},{"type":"HOWITZER","count":5,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-23",
        "number": 23,
        "name": N_("Rotterdam Europoort"),
        "objective": N_("Storm the container terminal and destroy the loading command post"),
        "briefing": N_("Europoort is the gateway to the open ocean—if those prototype crates reach the interceptor barge, Prometheus vanishes into international waters. Punch through the container canyons and oil tank farms, storm the loading command post, and slam the Dutch ports shut, forcing Kranz south to Brussels."),
        "layout": N_("Massive deep-water port maze of stacked shipping containers, gantry cranes, oil storage tanks, and concrete quays divided into the Maashaven bridge, central freight spine, and eastern barge slip."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":4,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-24",
        "number": 24,
        "name": N_("Brussels: Cinquantenaire"),
        "objective": N_("Breach the park defenses and destroy the HQ behind the triumphal arch"),
        "briefing": N_("Kranz's arrogance knows no bounds: he planted his regional command post right beneath Brussels' Cinquantenaire triumphal arch, steps from Europe's institutions, betting we wouldn't dare storm it. Prove him wrong—crush his HQ behind the arch to uncover his amphibious ambush plans for Antwerp."),
        "layout": N_("Symmetrical Jubelpark ensemble with formal lawns, flanking tree-lined avenues, and the semicircular colonnade and triumphal arch shielding the rear command post."),
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
        "briefing": N_("In Antwerp the sea reaches right to the warehouse gates. Recon spotted Consortium landing barges approaching the Scheldt locks—they want this port back to cover their breakout from the delta. Anchor the defense around our dock workshop and throw their amphibious assault back into the river."),
        "layout": N_("Enclosed Scheldt dock basins, massive brick warehouses, fuel depots, and three lock crossings—a central haul pier and two flanking lock bridges—with obstructed sightlines."),
        "difficulty": N_("High"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"HOVER","count":5,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-26",
        "number": 26,
        "name": N_("Scheldt Delta Dams"),
        "objective": N_("Break the delta barrier defenses and sink Hydra"),
        "briefing": N_("Every Benelux port is locked down, and Kranz's third Sector Boss—Hydra, an amphibious MLRS-9 rocket cruiser built on the third Roman module—is using the flooded Scheldt estuary to bombard our tracks from untouchable water. Watch the salvo markers, thread the storm-surge causeways, and sink Hydra to seal the North Sea forever."),
        "layout": N_("Coastal storm-surge barrier and reclaimed polders across open estuary water, connected by four dry causeways, sluice bridges, dune windbreaks, and destructible floodgate bulkheads."),
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
        "objective": N_("Destroy the Consortium armored column on the Champs-Élysées"),
        "briefing": N_("The lights of the Champs-Élysées are dark, and Kranz's armored column is thundering down the cobbles from the Arc de Triomphe toward Place de la Concorde, trying to punch straight through Paris and flee south. Seal the avenue and flank through the gardens—break their column here to force their reserves out at Versailles."),
        "layout": N_("Grand Axe Historique boulevard broken by the Rond-Point fountain island and barricades, flanked by the wooded Jardins des Champs-Élysées, Grand Palais, Haussmannian side streets, and three Seine bridges."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"ARMOR","count":3,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-28",
        "number": 28,
        "name": N_("Versailles"),
        "objective": N_("Hold the Versailles palace HQ against the Consortium counteroffensive"),
        "briefing": N_("The royal gardens of Versailles were built for flawless symmetry—and today that symmetry becomes our firing grid. Kranz's southern reserves are surging around the Grand Canal to hit Vanguard's forward HQ in the Marble Court. Hold the lines by the Latona and Apollo fountains to shatter his last reserve in Northern France."),
        "layout": N_("Palace of Versailles and geometric parterre gardens, where the Grand Canal, bosquets, and Latona and Apollo fountain basins channel multi-wave assaults around the Marble Court HQ."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":6,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"STANDARD","count":11,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"KAMIKAZE","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":5,"notes":"5 encounters"}
      },
      {
        "id": "campaign-29",
        "number": 29,
        "name": N_("Lyon Industrial"),
        "objective": N_("Push through the industrial corridor and destroy the main assembly hall"),
        "briefing": N_("Lyon's Chemical Valley along the Rhône is Kranz's last major workshop before Spain, and our sensors show massive power spikes—his mechanics are frantically rebuilding something huge from salvaged parts. Break into the petrochemical corridor and level their assembly hall, even if recon warns one rebuilt giant has already slipped south."),
        "layout": N_("Dense petrochemical corridor along the Rhône with giant tank farms, pipeline mazes, central Consortium refit halls, eastern rail sidings, and breachable containment bunds."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":4,"phase":"regular"},{"type":"HOVER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"ENGINEER","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-30",
        "number": 30,
        "name": N_("Mont Blanc"),
        "objective": N_("Ascend the glacier approaches and destroy the high-col radar fortress"),
        "briefing": N_("We are flying blind—a broadband jammer atop the Mont Blanc massif has knocked out every satellite link from the Rhône to the Mediterranean. Bottomless glacial crevasses yawn below and whiteout fog hides the cable-car pylons, but there is no other way to get our eyes back. Climb the col and silence that radar."),
        "layout": N_("Fog-shrouded glacial plateau amid granite peaks, sliced by impassable crevasses, icy moraines, cable-car pylons, conifer ambush pockets, and avalanche barriers below the summit radar."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":2,"phase":"regular"},{"type":"STANDARD","count":7,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOVER","count":2,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-31",
        "number": 31,
        "name": N_("Provence Lavender"),
        "objective": N_("Hunt down all Consortium snipers and scouts across the plateau"),
        "briefing": N_("The sweet scent of lavender and sun-baked stone is the last thing you expect in war—yet Kranz's best tank destroyers and stealth scouts are dug into those purple rows and hilltop stone walls to bleed us dry before the coast. Stay out of the open plateau: use the dry riverbed, close the distance, and clear every ridge down to Nice."),
        "layout": N_("Sun-drenched Valensole-style plateau of parallel lavender hedge rows, rocky ridges, a dry riverbed crossing, and a stone-walled hilltop village overlooking open kill zones."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":5,"phase":"regular"},{"type":"STANDARD","count":8,"phase":"regular"},{"type":"STEALTH","count":4,"phase":"regular"},{"type":"STRIKER","count":2,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"JAMMER","count":2,"phase":"regular"},{"type":"ARMOR","count":2,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-32",
        "number": 32,
        "name": N_("Nice: Côte d'Azur"),
        "objective": N_("Clear the coastal escort and destroy the rebuilt Mammoth MK-V"),
        "briefing": N_("There is the ghost from Lyon's workshops. Kranz raised Mammoth from the ashes, bolted on heavier armor, and planted it on Nice's Promenade des Anglais to block the road to Spain. Our old acquaintance wants a rematch under the Riviera palms—in Dresden we took it apart; in Nice, make sure nothing is left to salvage."),
        "layout": N_("Seven-kilometer Promenade des Anglais arc along the Bay of Angels, palm-lined beachfront, tight ochre alleys of Vieux Nice, and Port Lympia yacht piers offering cover from heavy fire."),
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
        "objective": N_("Hold the Pas de la Casa HQ against snowbound assault columns"),
        "briefing": N_("The Pyrenees are Kranz's last mountain shield. Desperate to keep us out of Spain, his all-terrain assault columns are descending the snowy ski pistes and CG-2 pass road into Pas de la Casa from every side. Lock down the resort streets and break their winter offensive on the ice."),
        "layout": N_("High-altitude ski resort town wedged between steep snowy pistes, ski-lift pylons, the CG-2 pass switchbacks, and breachable snow-shed walls funneling attacks from multiple heights."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":3,"phase":"regular"},{"type":"ARMOR","count":6,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"STRIKER","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"STEALTH","count":1,"phase":"regular"},{"type":"KAMIKAZE","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-34",
        "number": 34,
        "name": N_("Bardenas Reales Range"),
        "objective": N_("Ambush and destroy the Consortium guard column on the firing range"),
        "briefing": N_("In the heart of Europe lies a scorched desert—the Bardenas Reales military range, where Kranz is zeroing in the elite escort for his final push. Hide behind the clay mesas and dry gullies, spring the ambush, and turn his last veteran crews into range targets before we reach Montserrat."),
        "layout": N_("Semi-desert badlands of layered clay-and-gypsum mesas, dry erosion gullies, scrub pockets, and concrete firing-range bunkers offering natural ambush cover."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"STANDARD","count":11,"phase":"regular"},{"type":"STEALTH","count":5,"phase":"regular"},{"type":"ARMOR","count":8,"phase":"regular"},{"type":"JAMMER","count":3,"phase":"regular"},{"type":"HOWITZER","count":4,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-35",
        "number": 35,
        "name": N_("Montserrat"),
        "objective": N_("Climb the mountain terraces and capture the Montserrat observation post"),
        "briefing": N_("The saw-toothed stone fingers of Montserrat look straight down onto Barcelona—from those monastery terraces, Kranz's spotters track every road to the sea. Pry them off the cliffs and only the city streets will stand between us and the port. Up the terraces, Vanguard-1!"),
        "layout": N_("Serrated limestone massif with a western crag gorge, central mountain switchback, and eastern monastery terraces along a steep funicular spine under plunging fire."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":2,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-36",
        "number": 36,
        "name": N_("Barcelona: Gothic Quarter & Sagrada Família"),
        "objective": N_("Clear all Consortium forces across the Gothic Quarter and Eixample"),
        "briefing": N_("We have reached the end of the Iron Road, but the city still has to fall. Kranz threw his remaining urban battalions into central Barcelona to bog us down while the freighter loads at the docks. Fight from the tight alleys of the Gothic Quarter through the octagonal Eixample grid beneath Sagrada Família—they are already firing up the ship's engines."),
        "layout": N_("Sharp urban contrast between the tight medieval alleys of the Gothic Quarter and La Rambla in the west, octagonal Eixample blocks in the east, and the central Sagrada Família complex."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":5,"phase":"regular"},{"type":"FLAMETHROWER","count":3,"phase":"regular"},{"type":"SAPPER","count":2,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"HOWITZER","count":2,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-37",
        "number": 37,
        "name": N_("Barcelona: Montjuic"),
        "objective": N_("Storm Montjuïc Castle and destroy the coastal artillery command"),
        "briefing": N_("For three centuries the guns of Montjuïc have commanded Barcelona's harbor—and Kranz has lined those 17th-century bastions with modern coastal batteries and targeting relays. Charging the docks under their sights is suicide. Storm the hilltop castle, silence the coastal guns, and clear our approach to the port."),
        "layout": N_("Coastal hill rising 185 meters above the harbor, featuring Olympic Ring pine parklands, terraced approaches, Mediterranean cliffside roads, and the bastions of Montjuïc Castle."),
        "difficulty": N_("Very high"),
        "status": "available",
        "enemyRoster": [{"type":"SCOUT","count":3,"phase":"regular"},{"type":"STANDARD","count":6,"phase":"regular"},{"type":"HOWITZER","count":3,"phase":"regular"},{"type":"STEALTH","count":2,"phase":"regular"},{"type":"ARMOR","count":4,"phase":"regular"},{"type":"FLAMETHROWER","count":1,"phase":"regular"},{"type":"STRIKER","count":3,"phase":"regular"},{"type":"SAPPER","count":1,"phase":"regular"},{"type":"ENGINEER","count":1,"phase":"regular"},{"type":"JAMMER","count":1,"phase":"regular"},{"type":"HOVER","count":1,"phase":"regular"}],
        "deploymentPlan": {"initialCount":4,"maxConcurrent":8,"notes":"3 encounters"}
      },
      {
        "id": "campaign-38",
        "number": 38,
        "name": N_("Barcelona: Port"),
        "objective": N_("Clear the port defenders and defeat the All-Boss Escalation and Titan"),
        "briefing": N_("From the ruins of Rome to the salt wind of Barcelona—thirty-eight sectors behind us, and the ghost freighter is smoking at the pier. Kranz is throwing everything Europe's forge built into one last steel ring before unveiling Titan, the supreme synthesis of all four Prometheus prototypes. This is Vanguard's final stand, Commander—close the Iron Road forever!"),
        "layout": N_("Expansive port arena uniting Port Vell and the Columbus Monument plaza with a massive container terminal, gantry crane quays, and long concrete breakwaters built for the All-Boss Escalation."),
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
