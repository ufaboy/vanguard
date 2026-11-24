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
        "briefing": N_("We have a live heist in the cradle of Rome, VANGUARD. Viktor Kaelen's strike teams caught us flat-footed, but those stolen Aegis-IX hulls are unarmed and uncalibrated—sluggish, blind, and heavy. The Consortium rearguard has turned the Colosseum and the Roman Forum into a makeshift fortress to cover the convoy's escape to the highway grid. Push through the ancient ruins, flush their armor out from behind the marble arches, and leave nothing intact that flies their banner. We don't let them reach the mountains."),
        "layout": N_("Thermal feeds over the Palatine Hill are completely washed out by oily diesel smoke. Under the Arch of Constantine, the Consortium didn't bother with finesse—they shredded our transfer column with heavy autocannons and hoisted four raw Aegis-IX hulls off their flatbeds before the escorts could even clear their barrels. Their haulers are already rumbling north down the Via dei Fori Imperiali, trading ancient travertine for time. With the Tyrrhenian ports sealed tight, they have no sea escape—they're digging in among the broken colonnades of the Forum to buy every second they can."),
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
        "briefing": N_("Our engineers are holding the gorge bridge, but Kaelen just ordered his rearguard to turn around and tear them apart. If that field workshop falls, our pursuit stalls for forty-eight hours and the trail goes ice-cold. Dig into the limestone ledges and lock down both the stone span and the shallow river ford. Hold that bridge against every wave they throw at you—keep our road into Lombardy open!"),
        "layout": N_("Our coastal net worked: Kaelen bypassed the Ligurian coast and plunged his heavy haulers straight into the Apennine limestone passes. Our forward engineering corps threw a field repair depot across a narrow stone bridge at the gorge mouth, but seismic sensors show a heavy Consortium column reversing direction. They know if our armor refuels here, we ride their rear bumpers all the way into Lombardy. The gorge walls are sheer rock; any artillery echo sounds like rolling thunder."),
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
        "briefing": N_("We're hunting ghosts while Kaelen runs for the Alps. Infiltrate Milan's industrial sidings, hunt down their three transmitter relays, and bring them down before their garrison seals off the canal crossings. Recover their real transit manifests on the way out. Once their digital smokescreen burns, we'll know exactly which Alpine pass they're heading for."),
        "layout": N_("Our satellite feeds outside Bologna just dissolved into phantom static. The Consortium spun up an electronic-warfare hub inside Milan's industrial belt, wedged between the Naviglio canal and the beltway freight yards. Sawtooth brick roofs, rusting train cars, and three high-output encrypted broadcast masts are spewing ghost convoy signals across northern Italy. While we chase shadows, the real haulers are slipping east toward Lake Garda."),
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
        "briefing": N_("The enemy is caught between the lake and the Roman brickwork of Verona. They've dug their tracks into the shore highway to keep us from reaching the mountain pass. Drive your armor through the lakeside orchards, smash their defensive screen against the water, and wipe out their southern escort wing. Once this road is ours, we chase them up into the high peaks."),
        "layout": N_("The Milan intercept gave us the vector: Kaelen's heavy transporters bypassed the western valleys and are grinding north along the Adige river corridor. Beside the cypress bluffs and quiet villas of Lake Garda, Consortium armor has fanned out across the lakeshore road near Verona's outer Roman walls. The water traps them on one side, but it limits our flanking angles just as badly. Behind that armored barricade, the stolen prototypes are gearing down for the climb into the snow."),
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
        "briefing": N_("Kaelen is trying to freeze us out of Central Europe. There is only one road across this ridge, and the Consortium poured a fortress into the stone to lock it down. Push your vehicles up the icy grade, punch through their forward rock emplacements, and shatter that summit bunker. Crack this frozen gate open—we're crossing the Alps!"),
        "layout": N_("Dry snow is whipping across the switchbacks at twenty below. The Aegis-IX haulers cleared the crest into Austrian Tyrol three hours ago, and Kaelen dropped dynamite charges on the ridge to bury every flanking trail. What's left is a frozen funnel commanded by a reinforced concrete bunker perched directly over the summit hairpin. It's an alpine cork—brutal, cold, and zero room for error."),
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
        "briefing": N_("Welcome to Bavaria. Before the convoy turned east into Tyrol, Kaelen made the Neuschwanstein heights his western Alpine surveillance post. Their spotters are feeding telemetry to their supply lines while their heavy guns cover the forest approaches. Advance through the timber, storm the ridge above the gorge, and tear down their mountaintop command nest. We take their eyes, and we take their regional rail logs."),
        "layout": N_("Fairytale spires, dark Bavarian pine woods, and heavy artillery. King Ludwig built Neuschwanstein as an artistic retreat, but Consortium logisticians have clamped radar dishes onto the limestone crags and fortified the ridge overlooking Lake Alpsee and the Pöllat Gorge. From this eagle's nest, their forward observers are tracking every wheel turning on the Alpine highway."),
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
        "briefing": N_("We have a chance to bleed their timetable. Those component crates hold the guidance and drive brains of the Aegis-IX. Breach the Innsbruck rail yards, reclaim every crate off those flatcars, and secure them at our extraction pad. Every crate we pull off that train forces Kaelen to waste days fabricating custom parts down the line. Move fast before the train rolls!"),
        "layout": N_("The manifests we seized at Füssen paid off. To lighten the road transporters for the mountain passes, Kaelen stripped specialized Aegis-IX fire-control modules and stabilizer crates off the hulls and routed them through the Brenner rail corridor. Floodlights are cutting through the freezing fog along the Inn River rail sidings right now—forklifts are loading our hardware onto armored freight cars."),
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
        "briefing": N_("The Consortium is trying to drown our pursuit in the river. Our vanguard holds the Old Town bridges, but enemy heavy armor is rolling downhill to crush us. Turn those stone spans into steel chokepoints. Anchor your hulls among the historic city blocks, repel every downhill charge, and break their offensive spine. We hold Salzburg, or our chase ends in the water."),
        "layout": N_("Salzburg's Baroque spires are echoing with heavy diesel groans. Furious over the Innsbruck raid, Kaelen unleashed his regional garrison from the massive stone and concrete ramparts of Hohensalzburg Fortress. They're descending the fortress hill in armored waves, attempting to drive our forward spearhead into the freezing currents of the Salzach River."),
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
        "briefing": N_("Vienna is Kaelen's Central European sorting yard, and he's stalling us along the Danube while his logistics crews swap the prototypes onto civilian heavy-haulers. The Wachau terraces are teeming with enemy scout squads and ambushes. Sweep the hillside vineyard lanes, clear the riverbanks, and eliminate every patrol in the valley. Don't let them slow our stride into the capital."),
        "layout": N_("A golden river mist hangs over the terraced vineyards of the Wachau Valley. Perched high above the water on a granite bluff, a Baroque abbey overlooks the broad sweep of the Danube. But down in the vines, thermal sensors are flashing red: Consortium hunter-killer patrols have dug into the terraces, setting up anti-tank crossfires across the river highway to shield Vienna's northern transit hubs."),
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
        "briefing": N_("We caught them mid-pivot! Kaelen abandoned the Danube and is running north into Bohemia. His rearguard is holding the heart of Vienna hostage to buy his haulers clean highway miles into Czechia. Advance across the Ringstraße, breach the barricades on Heldenplatz, and crush their defensive cordon under the palace windows. Break their grip on Vienna—we're following them into the Czech forests!"),
        "layout": N_("Imperial marble under siege. The convoy just cleared Vienna's northern freight yards and swung hard toward the Czech border, leaving an armored task force barricaded behind the Ringstraße boulevards. They've parked tanks beneath the grand curved facade of the Neue Burg and across the formal lawns of Heldenplatz, turning the palace plazas into open-field kill zones."),
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
        "briefing": N_("Kaelen brought the Aegis-IX hulls here to align their optic suites away from prying satellites. Those caves provide natural radar shielding, but it traps their support teams inside a narrow canyon network. Navigate the ravine roads, breach the cave-mouth bunkers, and neutralize their technical squads. We need their courier logs before they wipe their drives."),
        "layout": N_("North of Brno, the earth opens into ancient limestone sinkholes and the yawning, 138-meter drop of the Macocha Abyss. The canopy is dense, but intercepted bursts confirm Consortium technicians are operating mobile calibration rigs out of surface bunkers and natural cave mouths. The canyon tracks are too narrow for wide formations—one bad slip on wet rock and your vehicle is taking the plunge into the abyss."),
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
        "briefing": N_("That castle holds the entire master plan of the Iron Road. Kaelen's archivists are shredding records that tell us where those prototypes are heading and what he plans to build with them. Force the perimeter gates, storm the deer park, and secure the central keep before their thermite charges ignite. We need that operational blueprint intact!"),
        "layout": N_("The Moravian logs led us straight into the Bohemian woods. Konopiště Castle—Archduke Franz Ferdinand's old hunting retreat—is now the Consortium's Central European paper repository. Natural ponds and a steep wooded deer park choke off direct assault paths, and they've set up heavy turrets across the stone gatehouses. Drone thermals show fire pits smoking in the courtyard—they're burning their archives right now."),
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
        "briefing": N_("Kaelen is using Prague's historic crossings to choke our advance across the river. We cannot bypass the Vltava without losing days. Push along the riverbanks, break through the bridge tower checkpoints, and clear the Consortium armor holding both banks. Reclaim Prague and clear our path into the border mountains."),
        "layout": N_("Konopiště confirmed our worst nightmare: Kaelen is hauling the prototypes north to flash unlocked weapon firmware in Berlin, then west into the Ruhr for combat armor. To buy time, his mercenaries have fortified the Vltava riverfront in Prague. Stone statues look down on barricades spanning Charles Bridge, while snipers and heavy guns occupy the Gothic bridge towers between the Old Town and Malá Strana."),
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
        "briefing": N_("Visibility is down to zero and the enemy is on our perimeter! Consortium flankers are using the fog to wipe out our command post before we reach Germany. The swamps will keep their heavier tanks channeled onto the logging roads—anchor your defenses at the crossroads and hold the line. Break their border ambush here, and we descend straight onto the Elbe at Dresden!"),
        "layout": N_("A freezing autumn rain soaked the spruce forest along the old Iron Curtain border, and now a wall of dawn mist has swallowed everything. Our forward vanguard pitched a crossroads camp along the muddy logging routes of the Šumava, but engine growls are echoing through the trees. Peat bogs on both sides force all heavy armor onto narrow dirt tracks. An ambush is rolling out of the timber."),
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
        "briefing": N_("All units, high-value target engagement! Kaelen dropped his first regional titan to bar the river crossing. That is Mammoth—a glimpse of what those stolen hulls will become if we let the syndicate finish them. Don't trade shots with it in the open; pick apart its escort screen, use the river terraces for flanking angles, and pound its drive assemblies into the mud. Destroy Mammoth, secure the Elbe bridges, and take the road to Berlin!"),
        "layout": N_("The Elbe floodplains are shuddering. Beyond Augustus Bridge, Dresden's sandstone Frauenkirche dome towers over twenty kilometers of open green meadows. But in the open grass, a mechanical monster is throwing up plumes of black exhaust. It's our first confirmed Sector Boss: Mammoth. Quad-track drive, composite fortress plating, and multiple heavy siege barrels. It's anchoring the river crossing while Kaelen's convoy vanishes toward Berlin."),
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
        "briefing": N_("The syndicate is inside Berlin, attempting to bring those prototypes to life. We have to break into the capital before their software uploads finish. Advance down the avenues, flank the barricades beneath the Quadriga, and sweep Consortium armor out of Pariser Platz. Smash their outer screen so we can strike their command post at the river!"),
        "layout": N_("High-bandwidth transmission spikes are pulsing out of central Berlin. Kaelen's tech teams are holed up in the government district, desperately flashing unlocked fire-control firmware onto the Aegis-IX prototypes. To buy the hours they need, Consortium armor has barricaded Pariser Platz and the boulevards around the Brandenburg Gate, turning the neoclassical monument into an anti-tank kill zone."),
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
        "briefing": N_("We're tearing out Kaelen's northern brain. Force the Spree bridges, charge the open lawns under covering smoke, and demolish the Consortium command headquarters. We need the coordinates to their backup data cache before their servers purge. Level that stronghold and sever their command chain in Germany!"),
        "layout": N_("The Consortium's northern command bunker is dug into the bend of the Spree. Interlocking anti-tank bunkers command the Spree river spans and the broad, open lawns of the Reichstag. The convoy haulers have already slipped past the western ring, but the command staff is still inside, coordinating their western escape vector and routing encrypted telemetry to a secondary site along the old Wall line."),
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
        "briefing": N_("This is a surgical demolition strike. We're not here to trade attrition; we're here to burn their future. Slip through the rail sidings, plant charges on the blueprint vault and its satellite uplinks, and get out before their heavy QRF pins you against the Wall. Burn that vault—make sure these four hulls are the only ones that ever exist!"),
        "layout": N_("Beside rusting tracks and graffiti-covered slabs of the old Berlin Wall sits an abandoned freight warehouse. This is Kaelen's crown jewel: an air-gapped blueprint vault housing the master schematics to mass-produce the Aegis-IX design. Uplink dishes are warming up on the warehouse roof. If they transmit those schematics to offshore servers, destroying four prototypes won't mean a thing."),
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
        "briefing": N_("Kaelen is running for the Ruhr industrial basin, and he's using the Harz Mountains as his radar watchtower. We can't advance our main armor until these heights are quiet. Fight through the granite crags, sweep the narrow-gauge tracks, and eliminate every spotter in the timber. Clear the ridge so our column can charge the Rhine!"),
        "layout": N_("Cold mountain winds are whipping across the granite boulders of Mount Brocken. The convoy is racing across the plains toward the Rhine, but Kaelen left scout squadrons and forward observers perched along the narrow-gauge Brocken railway. Shrouded in pine forest and mountain fog, they have spotters overlooking every western highway approach, ready to call precision artillery on our pursuit column."),
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
        "briefing": N_("We hold the Rhine crossing, and Kaelen is throwing everything he has left to tear it down! If we lose this bridgehead, our chase dies while we spend a week laying pontoons. Anchor your armor beside the stone bridge towers, protect the piers from demolition charges, and hold the perimeter against their assault waves. Hold Remagen—the Ruhr is right on the other side!"),
        "layout": N_("History is repeating itself on the Rhine. Beneath the black basalt cliffs of the Erpeler Ley, our vanguard caught Consortium demolition squads off-guard and captured an intact bridgehead at Remagen. But Kaelen cannot afford to let us cross. Every reserve battle group within fifty kilometers has turned around and is hurtling toward the river to throw us into the water."),
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
        "briefing": N_("The Aegis-IX prototypes are now fully armored war machines, and they're hauling ass for the North Sea! Kaelen left his personal executioner behind to burn our pursuit to ash. Against Cerberus-T, static cover is instant death. Stay at top speed, navigate the industrial rail maze, and strike it from outside its flame radius. Slay this beast, wreck Kaelen's steel furnace, and advance into the Low Countries!"),
        "layout": N_("The sky over the Ruhr glows an angry, bruised orange. Towering blast furnaces, conveyor bridges, and black slag heaps dominate the industrial basin. The convoy just pulled out—newly clad in thick, reactive composite armor plates. To ensure their clean getaway to the Dutch ports, Kaelen unleashed Sector Boss Cerberus-T. It's a thermobaric siege leviathan. Any wall, warehouse, or trench you hide behind will turn into incandescent slag the moment it fires."),
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
        "briefing": N_("Kaelen is running for the coast—his endgame is to load those prototypes onto an ocean freighter and vanish into international waters. His rearguard is using Amsterdam's canal bridges to bottle us up. Push along the quays, secure the bridges, and clear their armored units out of the canal belt. Clear the city fast—we need to hit Rotterdam before the ship sails!"),
        "layout": N_("Dark water, narrow brick quays, and leaning merchant gables. The 85-meter spire of the Westerkerk rises over Prinsengracht, but the historic canal ring is an urban maze. Consortium rearguard detachments have ducked into the concentric waterways, barricading bridges to bottleneck our vanguard while their heavy haulers race south toward the deep-water berths at Rotterdam Europoort."),
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
        "briefing": N_("We beat their freighter to the docks! Those three cargo crates hold the fire-control cores meant for the prototypes. Penetrate the container canyons, seize all three crates under heavy fire, and deliver them to our extraction pad. Steal those modules back—Kaelen won't be loading a damn thing out of Rotterdam today!"),
        "layout": N_("Colossal gantry cranes and endless canyons of multi-colored shipping containers stretch to the edge of the North Sea. Our air wings forced Kaelen's freighter to stand off offshore, leaving three critical shipping crates of prototype weapon modules stranded on the quayside. Heavily armed dock patrols and automated security grids are swarming the container aprons."),
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
        "briefing": N_("We're cutting Kaelen's financial and logistical lifeline. His syndicate command in Brussels is trying to buy him an exit out of Belgium. Advance up the grand esplanades, punch through the heavy armor dug in along the museum wings, and demolish the Consortium headquarters under the arch. Take Brussels, and international authorities freeze every northern berth he owns."),
        "layout": N_("The triple triumphal arch of Parc du Cinquantenaire towers over the European Quarter, but the manicured lawns and museum colonnades have been turned into a fortress. While Kaelen scrambles to reroute his shipping to Antwerp, his regional directors are operating out of a bunker beneath the arch, coordinating mercenary reinforcements and forged maritime clearance papers."),
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
        "briefing": N_("This is the final lock on the North Sea! If those gates open, Kaelen's cargo vessel slips in, loads the Aegis-IX hulls, and vanishes. Hold that dockside workshop with everything you have. Use the warehouse alleys to funnel their tanks and repel their landing craft until high tide passes. Slam the North Sea door shut for good!"),
        "layout": N_("Eighty kilometers up the tidal Scheldt, colossal sea locks keep Antwerp's deep basins afloat against a massive six-meter tide. With Rotterdam dead, this is Kaelen's final northern exit. Our combat engineers have just seized a dockside workshop beside the lock gates, jamming the hydraulic valves shut. But Consortium assault craft and heavy dock armor are mounting a desperate counterattack to break the locks open."),
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
        "briefing": N_("The North Sea is officially sealed, and Kaelen is running south for France! Hydra is pacing the barrier from deep water, using the open waves to obliterate our pursuit. Advance across the concrete sluices and coastal dunes! Use the massive dam pillars for cover between rocket barrages, draw its fire, and send Hydra to the bottom of the delta. Clear the road to France!"),
        "layout": N_("Gale-force North Sea winds are battering the sixty-five concrete piers of the Eastern Scheldt storm-surge barrier. Antwerp held—and maritime radar caught Kaelen's freighter, the MV Iron Sovereign, abandoning northern waters and making a run around Spain toward the Mediterranean. But to cover his convoy's frantic overland escape south into France, Kaelen unleashed Sector Boss Hydra. It's an amphibious rocket cruiser gliding through open sea channels where our tracks can't follow, bombarding the dam causeways with missile salvos."),
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
        "briefing": N_("Kaelen is running at full throttle for the Mediterranean. He threw an armored division into central Paris to tie us down while his haulers sprint down the Rhône corridor. Advance along the Champs-Élysées, flank their barricades at the Arc de Triomphe, and wipe out their blocking armor. Break their line in the capital—we have to stay on their heels!"),
        "layout": N_("From the Arc de Triomphe down to Place de la Concorde, Paris's grand axis is a smoking battleground. Across the Seine, the Eiffel Tower stands silent witness to an armored breakout. Desperate to secure the southern autoroutes toward Lyon, Kaelen threw a heavy screening division straight down the Champs-Élysées, using monuments, gardens, and metro plazas as defensive barricades."),
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
        "briefing": N_("They tried to pull our teeth while we looked away! If Versailles burns, our logistics collapse and Kaelen walks away. Anchor your defenses among the formal gardens, stone terraces, and palace groves. Break up their armored charges along the royal canal and crush this counterattack. Hold Versailles—our chase down the Rhône depends on it!"),
        "layout": N_("While we were engaging their screen in Paris, a detached Consortium strike group circled west to hit our forward supply depot established on the grounds of Versailles. Gilded statues and the marble fountains of Latona and Apollo now frame an armored assault. Enemy tanks are tearing across the Grand Perspective, aiming to incinerate our fuel reserves before we can pursue south."),
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
        "briefing": N_("We found where they're loading the guns. If those prototypes reach Spain with full munitions racks, our final fight becomes an impossible slaughter. Infiltrate the chemical corridor, sabotage their munitions refit line, and extract before the refinery detonates. Starve those prototypes of syndicate firepower!"),
        "layout": N_("South of Lyon, miles of cracking towers, chemical tanks, and rail sidings line the Rhône in the Vallée de la Chimie. Intercepts confirm Kaelen commandeered a high-output chemical refinery. His engineers are synthesizing specialized propellants and loading heavy live ordnance into the Aegis-IX hulls. Volatile fuel lines run everywhere—one spark could ignite the entire riverbank."),
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
        "briefing": N_("We're flying blind until you rip that radar station off the mountain. Kaelen is buying a ghost sprint toward the Spanish border. Scale the glaciated ridges, watch out for bottomless crevasses, and breach their fortress beneath the cable towers. Destroy that radar dome and give us our satellite eyes back!"),
        "layout": N_("At 3,500 meters, our orbital feeds across southeastern France dissolved into blinding static. Shrouded in sub-zero blizzard clouds beneath the cable-car pylons of Mont Blanc, the Consortium anchored a high-altitude electronic-warfare fortress directly into the glacier ice. They're projecting an impenetrable jamming shield from Lyon to the Mediterranean. As long as that dish spins, Kaelen moves through Provence completely invisible."),
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
        "briefing": N_("We've got them cornered against the Mediterranean! To buy time on the coastal highway, Kaelen seeded the lavender plateaus with lethal sniper screens. Keep your vehicles at high speed, sweep the dry gullies, and root their tank destroyers out of the hillside villages. Clear Provence—the next stop is the sea!"),
        "layout": N_("Mont Blanc is down and orbital tracking is restored! The convoy just broke south across the sun-scorched Valensole Plateau of Haute-Provence. Rolling waves of purple lavender and dry limestone gullies hide long-range Consortium tank destroyers and sniper units. They've dug in along stone hilltop hamlets and dry riverbeds, waiting to bleed our spearhead as we race toward the coast."),
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
        "briefing": N_("He dredged the monster up from the dirt! The rebuilt Mammoth is sitting on the Promenade des Anglais, daring us to cross. Behind it, Kaelen's haulers are already grinding into the Pyrenean passes. We don't have time for a siege. Flush their ambushes out of the Old Town, hit the beach, and dismantle Mammoth for the final time. Break their coastal wall—we're taking the fight to Spain!"),
        "layout": N_("Turquoise waves lap the Baie des Anges and palm trees line the Promenade des Anglais, but seismic sensors just registered a nightmare. The metal beast from the Elbe didn't stay buried. Kaelen salvaged the shattered remains of Mammoth from Dresden, rebuilt it with heavy reactive plating, and deployed Mammoth II right across the beachfront. It's holding the Riviera road to buy the MV Iron Sovereign time to berth in Barcelona."),
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
        "briefing": N_("We're standing on the roof of the Pyrenees, and the enemy wants to bury us in the snow. Pas de la Casa is our only paved gateway into Catalonia. Traction is lethal on the ice—anchor your hulls among the village chalets, cover the switchbacks and open ski slopes, and shatter their downhill charges. Hold Andorra, and we drop straight down into Spain!"),
        "layout": N_("At 2,408 meters up the Port d'Envalira, freezing gale winds are whipping dry snow across the highest paved pass in the Pyrenees. Our spearhead seized the resort village of Pas de la Casa to secure the road into Spain. But Consortium alpine shock units are hurtling down the ski slopes in heavily armed snow columns, trying to seal us in the ice and sever our logistical tail."),
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
        "briefing": N_("We caught them with their barrels hot! Kaelen is trying to calibrate his newly armed prototypes among the firing range bunkers before rolling into Barcelona. This is our best chance to catch them on open ground. Strike through the clay canyons, ambush their test column among the concrete range targets, and obliterate their trial unit. Deny them their final firing data!"),
        "layout": N_("Seventy kilometers south of the snow, the landscape transforms into an arid, sun-bleached semi-desert of eroded clay mesas and bleached gullies. Intercepted telemetry caught a massive heat flare inside the Bardenas Reales military firing range. Kaelen diverted a heavy detachment into the badlands for one final, live-fire zeroing trial on the upgraded Aegis-IX turrets."),
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
        "briefing": N_("Barcelona is right over the mountain, and Montserrat is the final watchtower guarding Kaelen's rear. Satellite recon confirms the MV Iron Sovereign has berthed at the commercial docks below. Push your armor up the sheer stone switchbacks, fight through the monastery terraces, and demolish their mountain observation post. Blind their artillery so we can storm the city!"),
        "layout": N_("Like serrated stone teeth rising 1,200 meters above the Catalan plain, Montserrat commands the entire horizon down to Barcelona. The Consortium has converted the monastery terraces and sheer funicular tracks into their final inland command citadel. From those jagged conglomerate pinnacles, their long-range spotters and fire-control batteries can see every highway entering the city."),
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
        "briefing": N_("The clock is down to minutes, VANGUARD! The freighter is loading at the quay, and the Consortium is making us bleed for every intersection. Push through the narrow Gothic Quarter alleys, sweep the octagonal boulevards framing the Sagrada Família, and break their armored line. Reclaim Barcelona and charge the waterfront!"),
        "layout": N_("The city is a roaring battleground under the shadows of Gaudí's soaring spires. Port cranes are already swinging cargo nets at the docks, and Kaelen split his city garrison across two brutal fronts: close-quarters, claustrophobic ambushes in the medieval stone alleys of the Gothic Quarter, and interlocking heavy firing lines across the wide, chamfered octagonal blocks of the Eixample."),
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
        "briefing": N_("We cannot enter the port while those high guns are hot. This is our final covert strike. Storm the Olympic park approaches, breach Montjuïc Castle, and plant demolition charges on every coastal gun battery and fire-control relay on the heights. Silence those guns—give us our window to hit Kaelen's ship before she casts off!"),
        "layout": N_("Rising sheer above the container port, 17th-century Montjuïc Castle commands a complete plunging-fire kill zone over the piers. Across the castle ramparts and the adjacent 1992 Olympic Ring terraces, Consortium engineers have linked automated heavy coastal batteries and optical radar relays. If we set one track on the docks while Montjuïc is operational, they'll pound us into the harbor mud."),
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
        "briefing": N_("This is it, VANGUARD—the final battle of Operation Iron Road! From the ruins of Rome through the snows of the Alps, the forges of the Ruhr, and the storms of the Scheldt, every drop of sweat and blood brought us to this pier. The freighter is casting off, and Kaelen is rolling out Titan alongside every remaining war machine he has left. There are no retreat lines, no reinforcements, and no tomorrow if we fail. Tear through their container canyons, shatter their surviving titans, and bury Titan at the bottom of Barcelona harbor! Finish the Iron Road tonight! Roll out!"),
        "layout": N_("End of the line. Behind us sits the Columbus Monument; ahead lies the iron labyrinth of the container terminal. The MV Iron Sovereign is under full steam at the deep-water pier, lines ready to cast off. Kaelen has staked his syndicate's entire existence on this breakwater: every surviving Sector Boss chassis from across Europe is deploying in escalating waves. And leading them from the center of the terminal... is Titan. It's the fully realized nightmare—the Aegis-IX neural core fused with Ruhr armor, Lyon propellant, and heavy command rail systems."),
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
