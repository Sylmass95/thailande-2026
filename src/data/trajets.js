/* ====== TRAJETS : ESTIMATIONS DE PRIX (relevées en 2026 sur des sources publiques) ====== */
const PEOPLE = 2;
const APPS = {
  grab:{name:"Grab",deep:"grab://open?screenType=BOOKING",play:"https://play.google.com/store/apps/details?id=com.grabtaxi.passenger",
        info:"Équivalent d’Uber en Thaïlande (Uber a fusionné avec Grab en Asie du Sud-Est). Prix affiché avant la course, paiement en espèces ou par carte."},
  bolt:{name:"Bolt",deep:"",play:"https://play.google.com/store/apps/details?id=ee.mtakso.client",
        info:"Concurrent souvent un peu moins cher que Grab à Bangkok, Chiang Mai et Phuket."},
  indrive:{name:"inDrive",deep:"",play:"https://play.google.com/store/apps/details?id=sinet.startup.inDriver",
        info:"Vous proposez votre prix et les chauffeurs acceptent ou contre-proposent."}
};
const RIDE_BY_CITY = [
 ["Bangkok","Grab et Bolt : très fiables, prix affiché à l’avance."],
 ["Ayutthaya","Peu fiable : privilégiez le chauffeur privé ou un tuk-tuk à prix négocié."],
 ["Chiang Mai","Grab, Bolt et inDrive fonctionnent bien ; les songthaews rouges sont l’alternative locale."],
 ["Khao Sok et lac","Aucune appli : transferts réservés par l’hôtel."],
 ["Ao Nang / Krabi","Grab existe mais la disponibilité est irrégulière : songthaews, longtails et transferts privés."],
 ["Phuket / Mai Khao","Grab, Bolt et inDrive existent, mais peu de voitures très tôt le matin : taxi réservé la veille."]
];
/* opt : m=mode, lo/hi=prix en THB, unit = tot (total pour deux) · pp (par personne) · inc (inclus), t=durée, n=remarque */
const LEGS = {
 "l-bkk-hotel":{title:"Aéroport Suvarnabhumi → hôtel (Rambuttri)",fromQ:"Suvarnabhumi Airport, Bangkok",toQ:"Rambuttri Village Plaza, Soi Ram Buttri, Bangkok",mode:"driving",apps:["grab","bolt"],driver:"h:bkk",rec:0,
  opts:[
   {m:"Taxi officiel au compteur",lo:400,hi:550,unit:"tot",t:"45–70 min",n:"Compteur plus 50 THB de surtaxe aéroport plus péages (environ 25 à 75 THB). File officielle au niveau 1, portes 4 ou 7. Demandez « meter please »."},
   {m:"Grab ou Bolt",lo:450,hi:700,unit:"tot",t:"45–70 min",n:"Estimation : le prix est affiché avant la course, péages en sus. Point de rendez-vous indiqué dans l’appli."},
   {m:"Airport Rail Link puis taxi",lo:220,hi:400,unit:"tot",t:"60–90 min",n:"Train jusqu’à Phaya Thai (environ 45 THB par personne), puis taxi de 80 à 200 THB jusqu’à Rambuttri."}
  ]},
 "l-arun":{title:"Hôtel → Wat Arun",fromQ:"Rambuttri Village Plaza, Soi Ram Buttri, Bangkok",toQ:"Wat Arun Ratchawararam, Bangkok",mode:"driving",apps:["grab","bolt"],driver:"s:bkk-arun",rec:0,
  opts:[
   {m:"Bateau-bus puis ferry de traversée",lo:40,hi:80,unit:"tot",t:"25–40 min",n:"Embarcadère de Phra Arthit à 10 minutes à pied, bateau jusqu’à Tha Tien, puis ferry de 3 à 5 THB vers Wat Arun. Le plus agréable."},
   {m:"Taxi ou Grab",lo:100,hi:180,unit:"tot",t:"15–30 min",n:"Dites « Wat Arun ». Embouteillages possibles en fin de journée."}
  ]},
 "l-palace":{title:"Hôtel → Grand Palais",fromQ:"Rambuttri Village Plaza, Soi Ram Buttri, Bangkok",toQ:"Grand Palace, Bangkok",mode:"walking",apps:["grab","bolt"],driver:"s:bkk-palace",rec:0,
  opts:[
   {m:"À pied",lo:0,hi:0,unit:"tot",t:"15–20 min",n:"Environ 1,2 km. Partez tôt pour éviter la chaleur."},
   {m:"Taxi ou Grab",lo:50,hi:100,unit:"tot",t:"10 min",n:"Dites « Wat Phra Kaew ». Refusez tout tuk-tuk qui propose un tour ou annonce que le palais est fermé."}
  ]},
 "l-pho":{title:"Grand Palais → Wat Pho",fromQ:"Grand Palace, Bangkok",toQ:"Wat Pho, Bangkok",mode:"walking",apps:[],rec:0,
  opts:[{m:"À pied",lo:0,hi:0,unit:"tot",t:"5–10 min",n:"Longez le mur du palais vers le sud. L’entrée de Wat Pho est du côté de Sanam Chai Road."}]},
 "l-ayu-day":{title:"Chauffeur privé : Bangkok, Ayutthaya, Don Mueang",fromQ:"Rambuttri Village Plaza, Soi Ram Buttri, Bangkok",toQ:"Wat Mahathat, Ayutthaya",mode:"driving",apps:[],driver:"s:ayu-mahathat",rec:0,
  opts:[
   {m:"Chauffeur privé à la journée (hôtel, sites, dépose à DMK)",lo:3000,hi:4500,unit:"tot",t:"journée de 8 à 10 h",n:"Tarifs relevés : aller simple Bangkok–Ayutthaya environ 2 550 THB, journée complète avec chauffeur local environ 3 000 THB, supplément aéroport 200 à 300 THB. Confirmez le prix, les arrêts et l’attente par écrit."},
   {m:"Train depuis Bangkok puis tuk-tuk",lo:300,hi:800,unit:"tot",t:"1 h 30 de trajet plus visites",n:"Peu adapté ici : bagages à gérer et vol à 20 h 20 depuis Don Mueang."}
  ]},
 "l-ayu-dmk":{title:"Ayutthaya → aéroport Don Mueang",fromQ:"Wat Chaiwatthanaram, Ayutthaya",toQ:"Don Mueang International Airport",mode:"driving",apps:[],rec:0,
  opts:[
   {m:"Inclus dans la journée de chauffeur",lo:0,hi:0,unit:"inc",t:"1 h – 1 h 15",n:"Environ 56 km. Départ impératif à 16 h 15."},
   {m:"Transfert privé seul",lo:700,hi:1200,unit:"tot",t:"1 h – 1 h 15",n:"Tarifs locaux relevés entre 700 et 1 200 THB selon le véhicule."}
  ]},
 "l-cnx-hotel":{title:"Aéroport de Chiang Mai → hôtel",fromQ:"Chiang Mai International Airport",toQ:"At Pingnakorn Riverside, Charoen Rat Road, Chiang Mai",mode:"driving",apps:["grab","bolt"],driver:"h:cm",rec:0,
  opts:[
   {m:"Taxi à tarif fixe (comptoir, porte 1)",lo:150,hi:200,unit:"tot",t:"10–20 min",n:"Surtaxe aéroport de 50 THB incluse. Option la plus simple pour une arrivée tardive."},
   {m:"Grab ou Bolt",lo:100,hi:180,unit:"tot",t:"10–20 min",n:"Bolt est souvent le moins cher. Suivez les panneaux du point de rendez-vous."}
  ]},
 "l-cm-singh":{title:"Hôtel → Wat Phra Singh",fromQ:"At Pingnakorn Riverside, Charoen Rat Road, Chiang Mai",toQ:"Wat Phra Singh, Chiang Mai",mode:"driving",apps:["grab","bolt","indrive"],driver:"s:cm-singh",rec:0,
  opts:[
   {m:"Grab ou Bolt",lo:70,hi:120,unit:"tot",t:"10–15 min",n:"Course courte, prix bas."},
   {m:"Songthaew rouge partagé",lo:30,hi:60,unit:"pp",t:"15–20 min",n:"Négociez avant de monter, en vous mettant d’accord sur la destination."},
   {m:"À pied",lo:0,hi:0,unit:"tot",t:"30–40 min",n:"Agréable tôt le matin."}
  ]},
 "l-phalat":{title:"Vieille ville → Wat Pha Lat",fromQ:"Wat Phra Singh, Chiang Mai",toQ:"Wat Pha Lat, Chiang Mai",mode:"driving",apps:["grab","bolt","indrive"],driver:"s:cm-phalat",rec:0,
  opts:[
   {m:"Grab ou Bolt",lo:150,hi:250,unit:"tot",t:"20–30 min",n:"Estimation : les courses vers la montagne sont plus chères qu’en ville."},
   {m:"Songthaew affrété avec attente",lo:300,hi:500,unit:"tot",t:"à convenir",n:"Tarif relevé pour Doi Suthep en aller-retour avec attente. Négociez avant de monter."}
  ]},
 "l-suthep":{title:"Wat Pha Lat → Doi Suthep → hôtel",fromQ:"Wat Pha Lat, Chiang Mai",toQ:"Wat Phra That Doi Suthep, Chiang Mai",mode:"driving",apps:["grab","bolt","indrive"],driver:"s:cm-suthep",rec:0,
  opts:[
   {m:"Grab ou Bolt pour monter, songthaew partagé pour redescendre",lo:250,hi:400,unit:"tot",t:"15 min en montée, 30–40 min en descente",n:"Le songthaew part quand il est plein (environ 50 THB par personne). Vérifiez l’heure du dernier départ, souvent avant 18 h."},
   {m:"Grab ou Bolt aller et retour",lo:400,hi:650,unit:"tot",t:"20–40 min",n:"Estimation. Plus simple si vous visitez en fin de journée."},
   {m:"Songthaew affrété avec attente",lo:500,hi:700,unit:"tot",t:"à convenir",n:"Relevé entre 500 et 700 THB pour Doi Suthep, avec ou sans palais voisin. Négociez avant de monter."}
  ]},
 "l-cm-cnx":{title:"Hôtel → aéroport de Chiang Mai (5 h 45)",fromQ:"At Pingnakorn Riverside, Charoen Rat Road, Chiang Mai",toQ:"Chiang Mai International Airport",mode:"driving",apps:["grab","bolt"],rec:0,
  opts:[
   {m:"Taxi réservé par l’hôtel la veille",lo:150,hi:250,unit:"tot",t:"10–20 min",n:"À demander dès ce soir : peu de voitures disponibles à 5 h 45."},
   {m:"Grab ou Bolt",lo:100,hi:180,unit:"tot",t:"10–20 min",n:"Disponibilité incertaine à cette heure. Ne comptez pas dessus seul."}
  ]},
 "l-urt-ks":{title:"Aéroport de Surat Thani → Khao Sok",fromQ:"Surat Thani International Airport",toQ:"Khao Sok Las Orquideas Resort, Khlong Sok, Surat Thani",mode:"driving",apps:[],driver:"h:ks",rec:0,
  opts:[
   {m:"Taxi ou minivan privé",lo:1900,hi:2600,unit:"tot",t:"2 h – 2 h 30",n:"Relevé entre 1 900 et 2 600 THB, jusqu’à 3 500 THB sur certaines plateformes. Environ 120 km, dépose au resort."},
   {m:"Minivan partagé (Phantip)",lo:250,hi:300,unit:"pp",t:"2 – 2 h 30",n:"Peu de départs, ne coïncide pas toujours avec le vol de 10 h 05. Achetez le billet directement au guichet de l’opérateur."}
  ]},
 "l-ks-an":{title:"Khao Sok → Ao Nang",fromQ:"Khao Sok Las Orquideas Resort, Khlong Sok, Surat Thani",toQ:"Aonang Fiore Resort, Ao Nang, Krabi",mode:"driving",apps:[],driver:"h:an",rec:0,
  opts:[
   {m:"Transfert privé",lo:2500,hi:3500,unit:"tot",t:"2 h 30 – 3 h 30",n:"Estimation d’après les tarifs Khao Sok–Krabi (environ 2 000 THB) et aéroport de Phuket–Ao Nang (à partir de 3 000 THB). À demander à Las Orquideas."},
   {m:"Minivan partagé Khao Sok → Krabi, puis songthaew",lo:360,hi:410,unit:"pp",t:"environ 4 h",n:"Un seul départ le matin (300 à 350 THB), puis songthaew vers Ao Nang (environ 60 THB). Ne convient pas si le retour du lac est tardif."}
  ]},
 "l-railay":{title:"Ao Nang → Railay West (longtail)",fromQ:"Ao Nang Beach, Krabi",toQ:"Railay West Beach, Krabi",mode:"driving",apps:[],driver:"s:an-railay",rec:0,
  opts:[
   {m:"Longtail partagé, aller-retour pour deux",lo:400,hi:600,unit:"tot",t:"15–20 min",n:"Environ 100 THB par personne et par trajet, en espèces, plus 50 THB après 18 h. Départ quand le bateau est plein, premier vers 8 h, dernier retour vers 18 h. Comprend le trajet de l’hôtel jusqu’à la plage."}
  ]},
 "l-an-mk":{title:"Ao Nang → Mai Khao (Phuket)",fromQ:"Aonang Fiore Resort, Ao Nang, Krabi",toQ:"Maikhao Palm Beach Resort, Mai Khao, Phuket",mode:"driving",apps:[],driver:"h:mk",rec:0,
  opts:[
   {m:"Transfert privé direct",lo:3000,hi:4500,unit:"tot",t:"2 h 30 – 3 h 15",n:"Environ 150 à 170 km. Les transferts Ao Nang – aéroport de Phuket démarrent vers 3 000 THB, Mai Khao est à 10 km de l’aéroport."},
   {m:"Minivan partagé jusqu’à Phuket, puis taxi",lo:700,hi:1300,unit:"pp",t:"3 h 30 – 4 h",n:"Environ 450 à 900 THB par personne, puis un taxi de 250 à 400 THB. Plus long, avec bagages."}
  ]},
 "l-mk-hkt":{title:"Hôtel Mai Khao → aéroport de Phuket (4 h 40)",fromQ:"Maikhao Palm Beach Resort, Mai Khao, Phuket",toQ:"Phuket International Airport",mode:"driving",apps:["grab","bolt"],rec:0,
  opts:[
   {m:"Taxi réservé via l’hôtel",lo:400,hi:800,unit:"tot",t:"10–15 min",n:"Prix fixe à confirmer la veille. Environ 8 à 10 km."},
   {m:"Taxi ou Grab",lo:250,hi:400,unit:"tot",t:"10–15 min",n:"Rarement disponible à 4 h 40. Ne comptez pas dessus."}
  ]}
};
