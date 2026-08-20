export type Shot = {
	text: string;
	camera?: string;
};

export type ShotModule = {
	title: string;
	camera: string;
	aRoll: number[];
	shots: Shot[];
};

export const shotModules: Record<string, ShotModule> = {
	utreise: {
		title: 'Reisen til Kroatia',
		camera: 'Pocket 4 eller mobil',
		aRoll: [0, 1, 3, 6],
		shots: [
			{
				text: 'Odd, Lise og Oskar gjør seg klare hjemme.',
				camera: 'Insta360 X5'
			},
			{
				text: 'Håvard, Tina og Tomine gjør seg klare hjemme.',
				camera: 'Pocket 4'
			},
			{ text: 'Kofferter, babyutstyr og de siste tingene ut døra.' },
			{
				text: 'Familiene møtes på flyplassen og hilser på hverandre.',
				camera: 'Insta360 X5'
			},
			{ text: 'Innsjekking, bagasjebånd, sikkerhetskontroll og avgangstavle.' },
			{ text: 'Boarding, takeoff og reisen sett gjennom flyvinduet.' },
			{ text: 'Landing og de første reaksjonene i Kroatia.' },
			{ text: 'Taxituren fra flyplassen til marinaen, med bagasjen og første glimt av havna.' }
		]
	},
	overtakelse: {
		title: 'Overta båten',
		camera: 'Pocket 4',
		aRoll: [1, 2, 3],
		shots: [
			{ text: 'Bad Buoy sett fra brygga for første gang.' },
			{ text: 'Overleveringen med utleieselskapet: nøkler, papirer og praktisk gjennomgang.' },
			{ text: 'Kontroller sikkerhetsutstyr, redningsvester, motor, seil og tauverk.' },
			{ text: 'Bagasjen bæres om bord og stues i lugarer og stuverom.' }
		]
	},
	avreise: {
		title: 'Avreise',
		camera: 'Pocket 4',
		aRoll: [1, 2],
		shots: [
			{ text: 'Cockpit og dekk ryddes, og løse ting sikres før avgang.' },
			{ text: 'Motoren startes, og Bad Buoy gjøres fri fra brygge, bøye eller ankerplass.' },
			{ text: 'Begge babyene er klare for seilas med redningsvester og trygge plasser.' },
			{
				text: 'Bad Buoy setter kursen videre med stedet dere forlater i bakgrunnen.',
				camera: 'Mini Pro 5 eller Insta360 X5'
			}
		]
	},
	seiling: {
		title: 'Seiling og navigasjon',
		camera: 'Pocket 4',
		aRoll: [0, 1, 5],
		shots: [
			{ text: 'Seilene heises: tauverk, vinsj og duk som fylles av vind.' },
			{ text: 'Ved roret: hender, kompass, kartplotter og blikk fremover.' },
			{ text: 'Korte detaljer av tauverk i arbeid, vinsj og hender som justerer seilene.' },
			{ text: 'Seilene mot himmelen og duken som endrer form i vinden.' },
			{
				text: 'Vannet langs skroget og kjølvannet akter.',
				camera: 'Insta360 X5 på sikkert klemmefeste'
			},
			{ text: 'Livet om bord under seil: reaksjoner, kaffe, babyene og utsikten.' },
			{ text: 'Bad Buoy under seil med god plass rundt båten.', camera: 'Mini Pro 5' }
		]
	},
	motorseilas: {
		title: 'Motorseilas',
		camera: 'Pocket 4 eller Insta360 X5',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Motoren startes, fortøyningene går og båten setter fart.' },
			{ text: 'Motorlyd, instrumenter og vannet som passerer langs skroget.' },
			{ text: 'Ved roret: kartplotter, blikk fremover og små kursendringer.' },
			{ text: 'Livet om bord mens motoren går: kaffe, prat og en lur i skyggen.' }
		]
	},
	ankring: {
		title: 'Ankring',
		camera: 'Pocket 4',
		aRoll: [1, 2],
		shots: [
			{ text: 'Innseilingen i vika, sett fra baugen.' },
			{ text: 'Ankeret går: kjetting, dybdemåler og samarbeidet på dekk.' },
			{ text: 'Stillheten når motoren er slått av.' },
			{ text: 'Hele båten i vika, med land rundt.', camera: 'Mini Pro 5' }
		]
	},
	sup: {
		title: 'SUP',
		camera: 'GoPro eller Insta360 X5',
		aRoll: [1, 2],
		shots: [
			{ text: 'SUP-brett og åre gjøres klare ved båten.' },
			{ text: 'De første ustødige takene før balansen sitter.' },
			{
				text: 'Padling langs land eller rundt Bad Buoy.',
				camera: 'Insta360 X5 eller Mini Pro 5'
			},
			{ text: 'Nærklipp av åra i vannet, føtter på brettet og kjølvannet bak.' }
		]
	},
	snorkling: {
		title: 'Snorkling og fridykking',
		camera: 'GoPro',
		aRoll: [1, 2, 3],
		shots: [
			{ text: 'Maske og finner på ved badestigen.' },
			{ text: 'Følg en svømmer fra båten og ned under vann.', camera: 'GoPro' },
			{ text: 'Et rolig fridykk: nedstigningen, noen svømmetak og lyset fra overflaten.' },
			{ text: 'Tilbake ved badestigen og reaksjonen etter dykket.' }
		]
	},
	badepause: {
		title: 'Badepause fra båten',
		camera: 'GoPro eller Pocket 4',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Hopp og stup fra båten, med reaksjonene etterpå.' },
			{ text: 'Hoppene sett ovenfra med Bad Buoy og vika rundt.', camera: 'Mini Pro 5' },
			{ text: 'Film både fra båten, i vannflaten og under vann.', camera: 'GoPro' },
			{ text: 'En sammenhengende 360-sekvens fra sats til plask.', camera: 'Insta360 X5' },
			{ text: 'Våte ansikter, plask og latter mellom hoppene.' }
		]
	},
	morgenbad: {
		title: 'Morgenbad',
		camera: 'GoPro eller Pocket 4',
		aRoll: [1, 2],
		shots: [
			{ text: 'Den stille båten eller villaen før resten har våknet.' },
			{ text: 'Hopp i vannet før frokosten begynner.' },
			{ text: 'Noen rolige svømmetak i morgenlyset.', camera: 'GoPro' },
			{ text: 'Vannet, håndkleet og den første kaffen etter badet.' }
		]
	},
	babyring: {
		title: 'Bading med babyring',
		camera: 'GoPro eller Pocket 4',
		aRoll: [1, 2, 3, 4],
		shots: [
			{ text: 'Babyringen blåses opp og gjøres klar.' },
			{ text: 'Solbriller og solhatt kommer på før babyen går ut i sola.' },
			{ text: 'De første tærne i vannet og ansiktsuttrykket som følger.' },
			{ text: 'Ta først hele familien, deretter hender, føtter og plask.' },
			{ text: 'Håndkle og kos når badet er over.' },
			{ text: 'La Monsieur Bintang flyte forbi hvis han allerede er med i vannet.' }
		]
	},
	havn: {
		title: 'Havn og by',
		camera: 'Pocket 4',
		aRoll: [1, 2],
		shots: [
			{ text: 'Havna og byen mens dere seiler inn.' },
			{ text: 'Båten legges rolig til kai med fendere på plass og fortøyninger i land.' },
			{ text: 'Dere kommer dere i land med barnevogn eller bæresele.' },
			{ text: 'Folk, skilt, skodder og småting fra gatene.', camera: 'Pocket 4' }
		]
	},
	jolle: {
		title: 'Tur med jolla',
		camera: 'GoPro eller Insta360 X5',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Jolla gjøres klar og alle kommer trygt om bord.' },
			{ text: 'Bad Buoy blir mindre bak dere på vei inn mot land.' },
			{ text: 'Turen sett fra baugen med sjøsprøyt, ansikter og land foran.' },
			{ text: 'Ankomsten ved brygga eller stranden og de første som går i land.' }
		]
	},
	morgenhavn: {
		title: 'Morgen i havna',
		camera: 'A7 IV eller Pocket 4',
		aRoll: [1, 3],
		shots: [
			{ text: 'Havna før den våkner: stille brygger, master og morgenlys.' },
			{ text: 'Kaffe i cockpiten mens de første båtene drar.' },
			{ text: 'Tauverk, dugg og små detaljer på dekk.' },
			{ text: 'Familien våkner og dagen begynner om bord.' }
		]
	},
	proviant: {
		title: 'Handle inn',
		camera: 'Pocket 4 eller mobil',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Handleliste, kurver og letingen etter det dere trenger.' },
			{ text: 'Lokale råvarer, kalde drikker og små funn i butikken.' },
			{ text: 'Posene bæres gjennom gatene og tilbake til båten.' },
			{ text: 'Varene pakkes inn i skap, kjøleskap og stuverom.' }
		]
	},
	morgen: {
		title: 'Morgen om bord',
		camera: 'Pocket 4 eller A7 III',
		aRoll: [1, 3],
		shots: [
			{ text: 'Bad Buoy og stedet rundt før resten av båten våkner.' },
			{ text: 'De første som står opp, og de små rutinene som starter dagen.' },
			{ text: 'Morgenlys gjennom lukene, bare føtter og rolige detaljer om bord.' },
			{ text: 'Alle kommer etter hvert ut i cockpiten og dagen er i gang.' }
		]
	},
	frokost: {
		title: 'Frokost og kaffe',
		camera: 'Pocket 4 eller A7 III',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Kaffen lages fra første måling til den helles i koppene.' },
			{ text: 'Frokosten kommer på bordet: råvarer, pålegg, frukt og små detaljer.' },
			{ text: 'Alle spiser og praten kommer i gang rundt bordet.' },
			{ text: 'Kopper, smuler og oppryddingen når frokosten er ferdig.' }
		]
	},
	bbq: {
		title: 'BBQ',
		camera: 'Pocket 4 eller A7 IV · 55 mm',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Grillen gjøres klar og råvarene kommer ut.' },
			{ text: 'Glør, flammer, røyk og maten som legges på grillen.' },
			{ text: 'Følg arbeidet ved grillen mens maten blir ferdig.' },
			{ text: 'Den første smaksprøven rett fra grillen.', camera: 'Pocket 4' },
			{ text: 'Maten løftes av grillen og bæres til bordet.' }
		]
	},
	kjokken: {
		title: 'Matlaging på kjøkkenet',
		camera: 'Pocket 4 eller A7 IV · 55 mm',
		aRoll: [0, 3, 4],
		shots: [
			{ text: 'Råvarene legges frem i byssa eller på kjøkkenet.' },
			{ text: 'Hakking, røring og hender som arbeider på den lille benken.' },
			{ text: 'Gryter, stekepanne, damp og fresing ved komfyren.' },
			{ text: 'Samarbeidet og smaksprøvene mens maten blir ferdig.' },
			{ text: 'Den ferdige maten løftes ut av kjøkkenet og mot bordet.' }
		]
	},
	babylek: {
		title: 'Babylek',
		camera: 'Pocket 4 eller A7 III',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Barna oppdager en leke, en lyd eller noe nytt i omgivelsene.' },
			{ text: 'Hender, føtter, leker og de små detaljene i leken.' },
			{ text: 'Film en hel liten lekestund uten å avbryte.' },
			{ text: 'Smil, latter eller blikk mellom barna og de voksne.' }
		]
	},
	utflukt: {
		title: 'Utflukt',
		camera: 'Pocket 4',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Fra båten begynner turen med jolla inn til land.' },
			{ text: 'Et oversiktsklipp som viser alle på stedet.' },
			{ text: 'Film turen i babyhøyde: føtter, hjul, hender og det de ser.' },
			{ text: 'Velg én ting dere kommer til å huske: en pause, et funn eller utsikten.' }
		]
	},
	strand: {
		title: 'Strandtur',
		camera: 'Pocket 4 eller GoPro',
		aRoll: [0, 1, 2],
		shots: [
			{ text: 'Jolleturen fra Bad Buoy til stranden med håndklær og badeutstyr.' },
			{ text: 'Første møte med stranden og vannet.' },
			{ text: 'Lek, bading og små detaljer i sanden eller steinene.' },
			{ text: 'Familien samlet i omgivelsene før dere går tilbake.' }
		]
	},
	restaurant: {
		title: 'Middag i land',
		camera: 'Pocket 4 eller A7 IV · 55 mm',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Jolleturen inn til land og veien videre til restauranten.' },
			{ text: 'Menyen, bordet og drikke som blir satt frem.' },
			{ text: 'Maten kommer, deretter første smaksprøve og reaksjoner.' },
			{ text: 'Praten rundt bordet, tingting og kveldslyset på vei hjem.' }
		]
	},
	mat: {
		title: 'Måltid i cockpiten',
		camera: 'Pocket 4 eller A7 IV · 55 mm',
		aRoll: [0, 1, 3],
		shots: [
			{ text: 'Bordet dekkes ute til lunsj eller middag.' },
			{ text: 'Maten bæres ut og settes på bordet.' },
			{
				text: 'Maten serveres i cockpiten og alle begynner å spise.',
				camera: 'Pocket 4 eller A7 III · 55 mm'
			},
			{ text: 'Praten, serveringen og små øyeblikk rundt bordet.' },
			{ text: 'Tallerkener og glass ryddes bort når måltidet er ferdig.' }
		]
	},
	matInne: {
		title: 'Måltid under dekk',
		camera: 'Pocket 4 eller A7 IV · 55 mm',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Bordet dekkes under dekk til lunsj eller middag.' },
			{ text: 'Maten kommer inn fra byssa og settes på bordet.' },
			{
				text: 'Alle samles rundt bordet og begynner å spise.',
				camera: 'Pocket 4 eller A7 III · 55 mm'
			},
			{ text: 'Praten, serveringen og små øyeblikk rundt bordet.' },
			{ text: 'Tallerkener og glass ryddes bort når måltidet er ferdig.' }
		]
	},
	ankerol: {
		title: 'Ankerpils og kveld',
		camera: 'A7 IV · 55 mm eller Pocket 4',
		aRoll: [0, 2, 3],
		shots: [
			{ text: 'Kald ankerpils hentes fra kjøleskapet ute akter.' },
			{ text: 'Fang lyden når boksen eller flasken åpnes.' },
			{ text: 'Tingting når alle skåler.' },
			{ text: 'Cockpiten og vika mens praten går.' },
			{
				text: 'Det siste kveldslyset i glasset, vannet og ansiktene.',
				camera: 'A7 III · 55 mm'
			}
		]
	},
	solnedgang: {
		title: 'Solnedgang',
		camera: 'A7 IV eller Mini Pro 5',
		aRoll: [2],
		shots: [
			{ text: 'Et bredt klipp før sola begynner å gå ned.' },
			{ text: 'Lyset i vannet, på båten og i ansiktene.' },
			{ text: 'En rolig aktivitet i forgrunnen mens himmelen endrer seg.' },
			{ text: 'Bad Buoy og landskapet i solnedgangen sett fra lufta.', camera: 'Mini Pro 5' },
			{ text: 'Hold det siste klippet til sola er borte.' }
		]
	},
	legging: {
		title: 'Kveldsstell og legging',
		camera: 'A7 IV · 55 mm eller Pocket 4',
		aRoll: [0, 1, 2],
		shots: [
			{ text: 'Pysj, bleieskift og de små rutinene før leggetid.' },
			{ text: 'Dempet lys, en bok eller en rolig sang.' },
			{ text: 'Hender, gjesp og blikk mellom barna og de voksne.' },
			{ text: 'Den stille båten eller villaen etter at barna har sovnet.' }
		]
	},
	droneokt: {
		title: 'Droneøkt',
		camera: 'Mini Pro 5',
		aRoll: [0, 2],
		shots: [
			{ text: 'Start med Bad Buoy i vika og vis hvordan båten ligger i landskapet.' },
			{ text: 'Fly rolig over eller langs båten og få med livet på dekk.' },
			{ text: 'Følg jolla, SUP-brett eller Bad Buoy i bevegelse gjennom omgivelsene.' },
			{ text: 'Trekk rolig bakover og avslutt med båten som en liten del av landskapet.' }
		]
	},
	underdekk: {
		title: 'Livet under dekk',
		camera: 'Pocket 4',
		aRoll: [2],
		shots: [
			{ text: 'Gå rolig gjennom salongen, byssa og lugarene.' },
			{ text: 'Små ting som viser at to familier bor tett sammen.' },
			{ text: 'En vanlig rutine i den trange plassen.' },
			{ text: 'Utsikten opp gjennom luka eller ut mot cockpiten.' }
		]
	},
	catan: {
		title: 'Catan-kveld',
		camera: 'Pocket 4 eller A7 III',
		aRoll: [0, 2, 4],
		shots: [
			{ text: 'Spillet kommer på bordet og brettet bygges.' },
			{ text: 'Brikker, kort, terninger og hender som flytter ressurser.' },
			{ text: 'Film en hel handel eller diskusjon mellom spillerne.', camera: 'Pocket 4' },
			{ text: 'Reaksjoner på terningkast, blokkeringer og gode bytter.' },
			{ text: 'Vinnerøyeblikket og kommentarene rundt bordet.', camera: 'Pocket 4' }
		]
	},
	vaer: {
		title: 'Vær og endrede planer',
		camera: 'Pocket 4 eller GoPro',
		aRoll: [1, 2, 3],
		shots: [
			{ text: 'Været på vei inn over sjøen.' },
			{ text: 'Jakker på, luker igjen og hender i arbeid.' },
			{ text: 'Reaksjonene om bord når været endrer seg.' },
			{ text: 'Den nye ruten på kartet og stedet dere ender opp.' }
		]
	},
	ro: {
		title: 'Rolig dag',
		camera: 'A7 IV · 55 mm eller Pocket 4',
		aRoll: [0, 1, 2],
		shots: [
			{ text: 'Film noen minutter av babylivet uten å styre det.' },
			{ text: 'En voksen som hviler mens hverdagen går sin gang rundt.' },
			{ text: 'Bleieskift, flaske, lur eller lesestund.' },
			{ text: 'Et sammenhengende klipp med alle, uten oppstilling.', camera: 'Insta360 X5' },
			{
				text: 'Ta med Monsieur Bintang hvis han naturlig ligger på bordet eller flyter i nærheten.'
			}
		]
	},
	hengekoye: {
		title: 'Hengekøye',
		camera: 'Pocket 4 eller A7 III',
		aRoll: [1, 2],
		shots: [
			{ text: 'Hengekøyen festes trygt i cockpiten eller på fordekket.' },
			{ text: 'Noen legger seg til rette med båten og sjøen rundt.' },
			{ text: 'Rolig gynging, vind i duken og en avslappet stund.' },
			{ text: 'Hender, føtter og små detaljer i hengekøyen.' }
		]
	},
	brollBat: {
		title: 'B-roll fra båten',
		camera: 'Pocket 4 eller Insta360 X5',
		aRoll: [],
		shots: [
			{ text: 'Tauverk, knuter, vinsjer og beslag i arbeid.' },
			{ text: 'Vann langs skroget, kjølvann og skiftende lys i sjøen.' },
			{ text: 'Hender på roret, føtter på dekk og små bevegelser mens båten går.' },
			{ text: 'Kaffe, solbriller, redningsvester og ting som finner plass i cockpiten.' },
			{
				text: 'Bad Buoy sett fra baugen, akter og vannflaten for variasjon.',
				camera: 'Insta360 X5'
			},
			{ text: 'Flagget, master mot himmelen og land som passerer.' }
		]
	},
	brollBaby: {
		title: 'B-roll av babyene',
		camera: 'Pocket 4 eller A7 III · 55 mm',
		aRoll: [],
		shots: [
			{ text: 'Små hender, føtter, øyne og ansiktsuttrykk.' },
			{ text: 'Redningsvest, solhatt, leker og babyutstyr i bruk.' },
			{ text: 'Blikk og berøring mellom babyene og de voksne.' },
			{ text: 'En rolig stund med flaske, lur, bæring eller kos.' },
			{ text: 'Omgivelsene sett fra babyhøyde.' },
			{ text: 'Små reaksjoner på vann, vind, lyder og nye steder.' }
		]
	},
	brollVilla: {
		title: 'B-roll fra villaen',
		camera: 'Pocket 4 eller A7 IV · 55 mm',
		aRoll: [],
		shots: [
			{ text: 'Morgenlys gjennom vinduer, gardiner og dører som åpnes.' },
			{ text: 'Bare føtter, små hender, leker og spor etter hverdagen i huset.' },
			{ text: 'Kaffe, matlaging, glass og detaljer rundt bordet.' },
			{ text: 'Vannflaten, skygger og våte fotspor rundt bassenget.' },
			{ text: 'En rolig bevegelse gjennom huset og ut på terrassen.', camera: 'Pocket 4' },
			{ text: 'Kveldslys som tennes inne og ute.' }
		]
	},
	levering: {
		title: 'Levering av Bad Buoy',
		camera: 'Pocket 4',
		aRoll: [0, 1, 2],
		shots: [
			{ text: 'Siste innseiling og siste gang båten gjøres fast.' },
			{ text: 'Bagasjen ut og lugarene som tømmes.' },
			{ text: 'Et siste blikk tilbake før dere går.' },
			{ text: 'Bad Buoy alene ved brygga.' }
		]
	},
	villa: {
		title: 'Fra båt til villa',
		camera: 'Pocket 4',
		aRoll: [0, 1, 2, 3],
		shots: [
			{ text: 'Bagasjen fra brygga til bilen og inn døra i villaen.' },
			{ text: 'Første tur gjennom huset og ut til bassenget.' },
			{ text: 'De første barfotstegene på fast grunn.' },
			{ text: 'Det første måltidet i villaen.' }
		]
	},
	basseng: {
		title: 'Bassengliv',
		camera: 'GoPro eller Pocket 4',
		aRoll: [1, 2],
		shots: [
			{ text: 'Det stille bassenget før dagen begynner.' },
			{ text: 'Babyring, små tær og plask i vannet.' },
			{ text: 'Film i vannflaten og under vann.', camera: 'GoPro' },
			{ text: 'Våte fotspor, håndklær og en pause i skyggen.' },
			{ text: 'Monsieur Bintang kan dukke opp i bakgrunnen hvis han allerede er med.' }
		]
	},
	finale: {
		title: 'Avslutning',
		camera: 'A7 IV eller Pocket 4',
		aRoll: [1, 2, 3],
		shots: [
			{ text: 'Et sted eller en detalj dere kjenner igjen fra tidligere i turen.' },
			{ text: 'Det siste fellesmåltidet eller en siste tingting.' },
			{
				text: 'Alle samlet i ett sammenhengende klipp.',
				camera: 'Insta360 X5 eller Pocket 4 på stativ'
			},
			{ text: 'Hold det siste klippet noen sekunder ekstra.' }
		]
	},
	hjemreise: {
		title: 'På vei hjem',
		camera: 'Pocket 4 eller mobil',
		aRoll: [0, 2, 5],
		shots: [
			{
				text: 'Alle gjør seg klare på samme sted: pakking, babyutstyr og de siste tingene som skal med.',
				camera: 'Pocket 4'
			},
			{ text: 'Kofferter bæres ut, døra lukkes og feriestedet får et siste blikk.' },
			{
				text: 'Den store taxituren til flyplassen med alle og all bagasjen samlet.',
				camera: 'Insta360 X5'
			},
			{ text: 'Bagasje, avgangstavle, venting og en lur underveis.' },
			{ text: 'Boarding, flytur og utsikten gjennom vinduet.' },
			{ text: 'På flyplassen hjemme tar familiene farvel før de går til hver sin bil.' }
		]
	}
};

export const activityModuleIds = [
	'avreise',
	'seiling',
	'motorseilas',
	'ankring',
	'havn',
	'morgenhavn',
	'proviant',
	'sup',
	'snorkling',
	'badepause',
	'morgenbad',
	'babyring',
	'jolle',
	'utflukt',
	'strand',
	'morgen',
	'frokost',
	'bbq',
	'kjokken',
	'babylek',
	'mat',
	'matInne',
	'restaurant',
	'ankerol',
	'solnedgang',
	'legging',
	'droneokt',
	'underdekk',
	'catan',
	'vaer',
	'ro',
	'hengekoye',
	'basseng',
	'brollBat',
	'brollBaby',
	'brollVilla'
];

export const scenarioGroups = [
	{
		title: 'Seilas og havn',
		ids: ['avreise', 'seiling', 'motorseilas', 'ankring', 'havn', 'morgenhavn']
	},
	{
		title: 'Bading og aktivitet',
		ids: ['sup', 'snorkling', 'badepause', 'morgenbad', 'babyring', 'basseng', 'jolle', 'strand']
	},
	{
		title: 'Mat og kveld',
		ids: [
			'proviant',
			'frokost',
			'bbq',
			'kjokken',
			'mat',
			'matInne',
			'restaurant',
			'ankerol',
			'solnedgang',
			'legging'
		]
	},
	{
		title: 'Familie og turer',
		ids: ['morgen', 'babylek', 'utflukt', 'underdekk', 'hengekoye', 'catan', 'ro']
	},
	{
		title: 'Vær og luft',
		ids: ['vaer', 'droneokt']
	},
	{
		title: 'Generisk B-roll',
		ids: ['brollBat', 'brollBaby', 'brollVilla']
	}
] as const;

export const backupChecks = [
	'Filer kopiert fra minnekortene',
	'To kopier kontrollert',
	'Beste klipp notert',
	'Batterier til lading'
];
