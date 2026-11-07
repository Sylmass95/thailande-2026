/* ====== DONNÉES DU VOYAGE ====== */
const TRIP_TZ = "Asia/Bangkok";
const TZNAME = {"Europe/Paris":"heure de Paris","Asia/Qatar":"heure de Doha","Asia/Bangkok":""};

const HOTELS = {
  bkk:{name:"Rambuttri Village Plaza",city:"Bangkok",dates:"6–8 nov. · 2 nuits",ref:"6342.362.822",
    addr:"95 Soi Ram Buttri, Chakkra Phong Road, Phra Nakhon, Bangkok 10200",tel:"+6622829163",telTxt:"+66 2 282 9163",
    inout:"Arrivée dès 14 h 00 (early check-in 09 h–10 h demandé) · départ avant 12 h 00",
    note:"Dépôt de garantie de 500 THB en espèces. Si la chambre n’est pas prête, laisser les bagages à la réception."},
  cm:{name:"At Pingnakorn Riverside",city:"Chiang Mai",dates:"8–11 nov. · 3 nuits",ref:"5782.569.090",
    addr:"381 Charoen Rat Road, Wat Ket, Chiang Mai 50000",tel:"+6653249222",telTxt:"+66 53 249 222",
    inout:"Arrivée 14 h 00–00 h 00 (arrivée tardive 22 h–23 h signalée) · départ 12 h 00–12 h 30",
    note:"Arrivée tardive le 8 nov. : signalée à l’hôtel."},
  ks:{name:"Khao Sok Las Orquideas Resort",city:"Khao Sok",dates:"11–13 nov. · 2 nuits",ref:"5914.749.986",
    addr:"343 Moo 6, Khlong Sok, Phanom, Surat Thani 84250",tel:"+66817470610",telTxt:"+66 81 747 0610",
    inout:"Arrivée 14 h 00–21 h 00 · départ 07 h 00–12 h 00",
    note:"Activités à payer en espèces à l’hôtel : 4 200 THB au total. Ne payer le virement anticipé qu’avec les coordonnées reçues par la messagerie Booking."},
  lc:{name:"Nong Prae Raft House (forfait Las Orquideas)",city:"Lac Cheow Lan",dates:"13–14 nov. · 1 nuit",ref:"Forfait 6 480 THB pour deux",
    addr:"Lac Cheow Lan, parc national de Khao Sok (organisé par Las Orquideas)",tel:"+66817470610",telTxt:"Las Orquideas : +66 81 747 0610",
    inout:"Départ de Las Orquideas à 09 h 00 · retour le 14 après le check-out à 09 h 00",
    note:"Électricité de 18 h 30 à 22 h 30. Garder 680 THB de secours tant que les taxes du lac ne sont pas confirmées par écrit."},
  an:{name:"Aonang Fiore Resort",city:"Ao Nang",dates:"14–18 nov. · 4 nuits",ref:"6190.305.557",
    addr:"764 Moo 2, Ao Nang, Mueang Krabi 81180",tel:"+6675695522",telTxt:"+66 75 695 522",
    inout:"Arrivée 14 h 00–23 h 30 · départ 06 h 00–11 h 00",
    note:"L’établissement ne sert pas d’alcool."},
  mk:{name:"Maikhao Palm Beach Resort – SHA Plus",city:"Mai Khao / Phuket",dates:"18–19 nov. · 1 nuit",ref:"6188.828.627",
    addr:"Maikhao Soi 8, 126/5 Moo 4, Thalang, Mai Khao 83110",tel:"+6676616340",telTxt:"+66 76 616 340",
    inout:"Arrivée à partir de 15 h 00 · départ jusqu’à 12 h 00",
    note:"Demander un petit-déjeuner à emporter et confirmer le taxi de 04 h 40 la veille."}
};

/* helper : D(n, jour, titre, ville, hôtel, note, items) — item = [hh:mm, titre, détail, type, siteId, offset?, tz?] */
function D(n,day,title,city,sleep,note,items,off,tz){
  off=off||"+07:00"; tz=tz||TRIP_TZ;
  return {n:n,date:"2026-11-"+day,off:off,tz:tz,title:title,city:city,sleep:sleep,note:note,
    items:items.map(function(a){return {iso:"2026-11-"+day+"T"+a[0]+":00"+(a[5]||off),tz:a[6]||tz,title:a[1],detail:a[2]||"",kind:a[3]||"pratique",site:a[4]||null,leg:a[7]||null};})};
}

const DAYS = [
 D(1,"05","Paris → Doha → Bangkok (vol de nuit)","Voyage",null,
  "Passeports, confirmations hors ligne et TDAC (carte d’arrivée numérique) à portée de main.",[
  ["05:30","Arrivée à Paris-CDG Terminal 1","Enregistrement. Passeports, TDAC et confirmations accessibles hors ligne.","transport",null,"+01:00","Europe/Paris"],
  ["08:35","Décollage QR042 vers Doha","Airbus A380 · 6 h 20 de vol.","transport",null,"+01:00","Europe/Paris"],
  ["16:55","Arrivée à Doha","Correspondance de 3 h 25.","transport",null,"+03:00","Asia/Qatar"],
  ["20:20","Décollage QR838 vers Bangkok","Boeing 777-300ER · arrivée à Bangkok le 6 à 06 h 40.","transport",null,"+03:00","Asia/Qatar"]
 ],"+01:00","Europe/Paris"),
 D(2,"06","Bangkok : installation et Wat Arun","Bangkok","bkk",
  "Après un vol de nuit, ne pas surcharger la journée.",[
  ["06:40","Arrivée à Bangkok-BKK","Immigration, bagages, retrait d’espèces et SIM/eSIM.","transport"],
  ["08:30","Taxi officiel vers l’hôtel","Taxi officiel ou Airport Rail Link + taxi. Bagages à la réception si la chambre n’est pas prête. Prévoir 500 THB de dépôt.","transport",null,null,null,"l-bkk-hotel"],
  ["10:00","Petit-déjeuner, repos ou balade légère","Autour de Rambuttri. Massage possible.","rest"],
  ["15:00","Départ vers Wat Arun","Visite avant la fermeture, lumière de fin de journée. Épaules et genoux couverts.","visit","bkk-arun",null,null,"l-arun"],
  ["18:00","Dîner au bord du fleuve","Ou retour vers Khao San / Rambuttri.","meal"]
 ]),
 D(3,"07","Bangkok : Wat Arun puis Wat Pho (programme décalé)","Bangkok","bkk",
  "Programme décalé d’environ deux heures et demie : bateau vers Wat Arun vers 11 h 55, puis Wat Pho l’après-midi, couvert en cas de pluie. Le déjeuner est tardif : prévoyez de l’eau et un en-cas. Ce soir : confirmer le chauffeur d’Ayutthaya (départ 07 h 30 demain).",[
  ["08:00","Petit-déjeuner autour de Rambuttri","","meal"],
  ["11:55","Bateau vers Wat Arun","Bateau sur le fleuve, puis petit bac si besoin. Prix à vérifier avant de monter.","transport",null,null,null,"l-arun"],
  ["12:15","Wat Arun","Montée du prang central, vue sur le fleuve. Épaules et genoux couverts. Entrée environ 200 THB (tarif relevé en 2026, à vérifier). Eau et en-cas : le déjeuner est décalé.","visit","bkk-arun"],
  ["13:30","Petit bac vers Tha Tien","Quelques bahts.","transport"],
  ["13:45","Déjeuner côté Tha Tien, dans un endroit couvert","Pas trop épicé : « mai phet ».","meal"],
  ["14:45","Wat Pho et Bouddha couché","Bouddha couché et galeries couvertes en cas de pluie. Massage possible sur place. Entrée environ 300 THB. Fermeture vers 18 h 30, horaire à vérifier.","visit","bkk-pho"],
  ["16:45","Option : massage, bateau dans les khlongs ou retour à l’hôtel","Selon l’énergie et la météo. Les tours des khlongs s’arrêtent souvent en fin d’après-midi : tarif, durée et dernier départ à vérifier avant d’embarquer.","visit","bkk-khlong"],
  ["18:30","Soirée libre","Marché, massage ou dîner tranquille. Confirmer le chauffeur d’Ayutthaya pour demain 07 h 30.","rest"]
 ]),
 D(4,"08","Ayutthaya → vol vers Chiang Mai","Ayutthaya / Chiang Mai","cm",
  "Départ impératif d’Ayutthaya à 16 h 15 pour le vol de 20 h 20. Bagages dans la voiture du chauffeur. Prévoir de l’eau dans la voiture.",[
  ["07:30","Check-out, départ avec le chauffeur privé","Voiture avec coffre sécurisé toute la journée, dépose finale à Don Mueang.","transport","ayu-intro",null,null,"l-ayu-day"],
  ["09:15","Wat Mahathat","La tête de Bouddha dans les racines du banian.","visit","ayu-mahathat"],
  ["10:15","Wat Ratchaburana","Crypte du prang central. Escalier raide.","visit","ayu-ratchaburana"],
  ["11:30","Wat Phra Si Sanphet","Les trois chedis royaux.","visit","ayu-sisanphet"],
  ["12:15","Viharn Phra Mongkhon Bophit","Grand Bouddha de bronze.","visit","ayu-mongkhon"],
  ["13:00","Déjeuner, puis Wat Chaiwatthanaram si le temps le permet","Dernier arrêt panoramique au bord du fleuve.","visit","ayu-chaiwat"],
  ["16:15","Départ impératif vers Don Mueang (DMK)","Marge pour la circulation et les contrôles.","transport",null,null,null,"l-ayu-dmk"],
  ["18:00","Arrivée à DMK : enregistrement et dîner léger","","transport"],
  ["20:20","Vol FD3427 vers Chiang Mai","Arrivée à 21 h 35, puis taxi vers l’hôtel (arrivée tardive signalée).","transport",null,null,null,"l-cnx-hotel"]
 ]),
 D(5,"09","Chiang Mai : temples et Doi Suthep","Chiang Mai","cm",
  "Demain, prise en charge Doi Inthanon : être prêt dans le hall à 07 h 45.",[
  ["08:30","Wat Phra Singh","Vieille ville. Épaules et genoux couverts.","visit","cm-singh",null,null,"l-cm-singh"],
  ["09:45","Wat Chedi Luang","","visit","cm-cheddi"],
  ["11:00","Wat Chiang Man","","visit","cm-chiangman"],
  ["12:30","Déjeuner et pause","","meal"],
  ["14:30","Songthaew ou voiture vers Wat Pha Lat","Temple forestier.","transport","cm-phalat",null,null,"l-phalat"],
  ["16:00","Wat Phra That Doi Suthep","Rester pour la fin d’après-midi et le panorama.","visit","cm-suthep",null,null,"l-suthep"],
  ["19:00","Retour en ville, marché de nuit","Selon le jour et l’énergie.","meal"]
 ]),
 D(6,"10","Parc national de Doi Inthanon","Chiang Mai","cm",
  "Prévoir une couche chaude, des chaussures adhérentes et environ 800 THB en espèces pour deux (parc 300 + pagodes 100 par personne, tarifs 2026 à confirmer). Vol très tôt demain.",[
  ["07:45","Prêt dans le hall de l’hôtel","Prise en charge pour l’activité de 08 h 00 (référence BK349730705118024).","transport","din-summit"],
  ["10:00","Sommet de la Thaïlande et Ang Ka Nature Trail","","visit","din-summit"],
  ["11:30","Pagodes royales jumelles et jardins","","visit","din-pagodas"],
  ["13:00","Déjeuner inclus, marché Hmong, village Karen","","meal"],
  ["15:00","Cascades Sirithan et Wachirathan","","visit","din-falls"],
  ["17:30","Retour à Chiang Mai","Dîner calme, valises prêtes pour le vol de demain.","transport"]
 ]),
 D(7,"11","Chiang Mai → Surat Thani → Khao Sok","Khao Sok","ks",
  "Transfert URT → Khao Sok à confirmer. Massage à 16 h : 800 THB en espèces pour deux.",[
  ["05:45","Départ de l’hôtel vers CNX","Arrivée recommandée à l’aéroport vers 06 h 15.","transport",null,null,null,"l-cm-cnx"],
  ["08:10","Vol FD5420 vers Surat Thani (URT)","Direct, 1 h 55.","transport"],
  ["10:05","Arrivée à URT","Récupérer les bagages, rejoindre le transfert réservé.","transport"],
  ["10:45","Minivan ou voiture vers Khao Sok","Environ 2 h selon les arrêts.","transport","ks-parc",null,null,"l-urt-ks"],
  ["13:00","Arrivée, déjeuner, dépôt des bagages","Check-in à partir de 14 h.","meal"],
  ["15:30","Balade douce au village et au bord de la rivière","Ou repos à l’hôtel.","rest"],
  ["16:00","Massage thaïlandais pour deux","400 THB par personne, espèces à l’hôtel.","visit"]
 ]),
 D(8,"12","Rivière Sok et jungle","Khao Sok","ks",
  "Paiement automatique de la sortie Phi Phi prévu aujourd’hui (GetYourGuide). Préparer les sacs pour le lac.",[
  ["08:00","Petit-déjeuner","","meal"],
  ["09:00","Sok River Canyoning","Un canoë pour deux. 1 200 THB en espèces à l’hôtel.","visit","ks-parc"],
  ["12:30","Déjeuner","","meal"],
  ["15:30","ATV Jungle Tour (Sylvain)","2 200 THB en espèces à l’hôtel.","visit"],
  ["17:30","Retour, piscine ou repos","Dîner, puis sacs prêts pour le lac.","rest"]
 ]),
 D(9,"13","Las Orquideas → lac Cheow Lan","Lac Cheow Lan","lc",
  "Pas de distributeur sur le lac : retirer des espèces à Ta Khun. Programme susceptible de changer selon météo et niveau du lac.",[
  ["09:00","Départ de Las Orquideas vers le barrage","Arrêt au marché de Ta Khun : distributeur, snacks, achats pour la nuit.","transport"],
  ["10:30","Longtail sur le lac","Falaises calcaires.","transport","lc-lac"],
  ["12:00","Arrivée au Nong Prae Raft House","Installation, déjeuner thaï.","meal"],
  ["14:00","Randonnée guidée jusqu’à Diamond Cave","Chaussures fermées, lampe.","visit","lc-diamond"],
  ["17:00","Baignade, kayak ou repos","","rest"],
  ["17:30","Safari en bateau au coucher du soleil","","visit","lc-lac"],
  ["19:00","Dîner inclus et soirée","Électricité de 18 h 30 à 22 h 30.","meal"]
 ]),
 D(10,"14","Lac Cheow Lan → Ao Nang","Ao Nang","an",
  "Faire confirmer par Las Orquideas l’heure de retour du lac et la prise en charge pour Ao Nang (trajet à réserver séparément).",[
  ["07:30","Safari matinal en bateau","Animaux venus boire sur les rives.","visit","lc-lac"],
  ["08:30","Petit-déjeuner, dernière baignade","","meal"],
  ["09:00","Check-out, longtail, arrêt « Guilin of Thailand »","","visit","lc-guilin"],
  ["11:30","Retour à l’embarcadère puis à Las Orquideas","Heure à confirmer.","transport"],
  ["14:00","Transfert vers l’Aonang Fiore Resort","Prise en charge flexible après le retour du lac.","transport",null,null,null,"l-ks-an"],
  ["18:00","Installation, piscine, coucher de soleil","","rest"]
 ]),
 D(11,"15","Îles Phi Phi","Ao Nang","an",
  "Prévoir 800 THB de droits de parc en espèces. Crème solaire respectueuse du milieu marin.",[
  ["07:30","Prêt dans le hall de l’hôtel","Activité à 08 h 00, horaire exact de prise en charge communiqué par l’organisateur (référence GYG6H73R6WB6).","transport"],
  ["08:00","Excursion Phi Phi","Maya Bay, Pileh Lagoon, Phi Phi Don, Bamboo Island, snorkeling et déjeuner.","visit","an-phiphi"],
  ["16:00","Retour à Ao Nang","Soirée libre.","rest"]
 ]),
 D(12,"16","Railay et Phra Nang","Ao Nang","an",
  "Longtail partagé acheté sur place, environ 100 THB par trajet et par personne. Retour avant 17 h.",[
  ["08:00","Longtail public vers Railay West","Départ quand le bateau est plein.","transport","an-railay",null,null,"l-railay"],
  ["09:00","Railay West puis Phra Nang Cave Beach","Avant la foule.","visit","an-phranang"],
  ["12:30","Déjeuner à Railay","","meal"],
  ["14:00","Plage et point de vue (si terrain sec)","","rest"],
  ["17:00","Retour à Ao Nang","Avant la baisse de fréquence des bateaux.","transport"]
 ]),
 D(13,"17","Hong Islands en catamaran","Ao Nang","an",
  "Prévoir 600 THB de droits de parc, à payer à l’enregistrement. Menu A pour Sylvain. Le menu végétarien E avait été choisi pour la deuxième personne à la réservation : prévenez l’opérateur pour en changer.",[
  ["09:30","Fenêtre de prise en charge à l’hôtel","Attendre dans le hall 10 à 15 minutes avant l’heure communiquée.","transport"],
  ["11:00","Début de l’activité : navette, longtail, catamaran","Références BK364041493320936 et BK352621916655631.","transport","an-hong"],
  ["12:30","Déjeuner à bord","","meal"],
  ["15:00","Navigation, baignade et activités nautiques","","visit","an-hong"],
  ["17:30","Coucher de soleil autour de Daeng Island","","visit"],
  ["19:00","Retour estimé à l’hôtel","Dîner léger, préparation des bagages, confirmer le transfert de demain.","rest"]
 ]),
 D(14,"18","Ao Nang → Mai Khao","Mai Khao","mk",
  "Journée légère avant le vol matinal. Confirmer le taxi de 04 h 40 auprès de l’hôtel.",[
  ["10:00","Check-out et transfert direct vers Mai Khao","Bagages avec vous.","transport",null,null,null,"l-an-mk"],
  ["13:00","Arrivée dans le secteur, déjeuner, bagages","","meal"],
  ["15:00","Check-in, piscine, plage et repos","","rest","phuket-maikhao"],
  ["17:30","Dernier coucher de soleil à Mai Khao","","visit","phuket-maikhao"],
  ["20:00","Dîner tôt, taxi confirmé pour 04 h 40","Petit-déjeuner à emporter demandé.","meal"]
 ]),
 D(15,"19","Phuket → Doha → Paris","Retour",null,
  "Passeports et cartes d’embarquement à portée de main.",[
  ["04:40","Taxi vers l’aéroport de Phuket","","transport",null,null,null,"l-mk-hkt"],
  ["05:20","Arrivée à HKT, terminal international","","transport"],
  ["08:20","Décollage QR843 vers Doha","Arrivée à Doha à 11 h 10, correspondance de 4 h 30.","transport"],
  ["11:10","Arrivée à Doha","","transport",null,"+03:00","Asia/Qatar"],
  ["15:40","Décollage QR037 vers Paris","","transport",null,"+03:00","Asia/Qatar"],
  ["20:30","Arrivée à Paris-CDG Terminal 1","","transport",null,"+01:00","Europe/Paris"]
 ])
];
DAYS[14].sleep = null;

/* ====== RAPPELS ====== */
function R(id,day,hm,off,title,body){return {id:id,day:parseInt(day,10)-4,ms:Date.parse("2026-11-"+day+"T"+hm+":00"+off),title:title,body:body};}
const REMINDERS = [
 R("r01","05","04:30","+01:00","Départ pour CDG Terminal 1","Arrivée conseillée à 05 h 30. Passeports, TDAC, confirmations hors ligne."),
 R("r02","05","19:30","+03:00","Embarquement à Doha","QR838 à 20 h 20 vers Bangkok. Vérifiez la porte d’embarquement."),
 R("r03","06","05:30","+07:00","Bangkok dans environ une heure","À l’arrivée : immigration, retrait d’espèces, SIM. Prévoir 500 THB de dépôt à l’hôtel."),
 R("r04","06","14:30","+07:00","Wat Arun à 15 h","Épaules et genoux couverts. Fermeture en fin de journée."),
 R("r05","07","08:45","+07:00","Départ vers Wat Arun à 09 h 15","Tenue couvrante, eau, chaussures qui ne glissent pas : les marches du prang se font au sec."),
 R("r05c","07","13:20","+07:00","Bac vers Tha Tien dans 10 minutes","Puis déjeuner à couvert et Wat Pho vers 14 h 45 (environ 300 THB)."),
 R("r05d","07","16:30","+07:00","Fin de visite de Wat Pho","Massage, khlongs ou retour à l’hôtel : dernier départ des bateaux à vérifier."),
 R("r06","07","18:00","+07:00","Confirmer le chauffeur d’Ayutthaya","Départ demain 07 h 30 : bagages dans la voiture, plusieurs arrêts, dépose à Don Mueang."),
 R("r07","08","07:00","+07:00","Check-out Bangkok","Chauffeur à 07 h 30. Passeports et billets dans le sac de jour."),
 R("r08","08","15:45","+07:00","Départ impératif d’Ayutthaya à 16 h 15","Direction Don Mueang. Le vol décolle à 20 h 20."),
 R("r09","08","18:15","+07:00","Enregistrement à DMK","Vol FD3427 à 20 h 20. Dîner léger."),
 R("r10","08","21:35","+07:00","Arrivée à Chiang Mai","Taxi vers l’hôtel At Pingnakorn Riverside (arrivée tardive signalée)."),
 R("r11","09","08:00","+07:00","Vieille ville de Chiang Mai à 08 h 30","Wat Phra Singh, Chedi Luang, Chiang Man."),
 R("r12","09","20:00","+07:00","Demain : Doi Inthanon","Hall à 07 h 45. Couche chaude, chaussures adhérentes, environ 800 THB en espèces pour deux. Confirmer l’heure de prise en charge."),
 R("r13","10","07:15","+07:00","Prêt dans le hall à 07 h 45","Référence BK349730705118024. Eau, couche chaude, environ 800 THB pour deux."),
 R("r14","10","20:00","+07:00","Valises prêtes","Réveil à 05 h 00 : départ de l’hôtel à 05 h 45 pour le vol de 08 h 10."),
 R("r15","11","05:00","+07:00","Réveil","Départ de l’hôtel à 05 h 45. Arrivée à CNX vers 06 h 15."),
 R("r16","11","09:45","+07:00","Arrivée à Surat Thani","Confirmer le transfert URT → Khao Sok. Prévoir des espèces."),
 R("r17","11","15:30","+07:00","Massage à 16 h","800 THB pour deux, en espèces, à l’hôtel."),
 R("r18","12","08:30","+07:00","Canyoning à 09 h 00","1 200 THB en espèces à l’hôtel. Chaussures d’eau, maillot."),
 R("r19","12","15:00","+07:00","ATV à 15 h 30 (Sylvain)","2 200 THB en espèces à l’hôtel."),
 R("r20","12","19:00","+07:00","Préparer le lac","Répulsif, lampe frontale, maillot, sac étanche, batterie externe. Demain 09 h 00 : départ."),
 R("r21","13","08:30","+07:00","Départ pour le lac à 09 h 00","Retirer des espèces à Ta Khun, acheter eau et snacks. Garder 680 THB de secours."),
 R("r22","13","13:30","+07:00","Diamond Cave à 14 h 00","Chaussures fermées, lampe frontale, répulsif."),
 R("r23","13","17:15","+07:00","Baignade puis safari de 17 h 30","Répulsif et manches longues pour le safari."),
 R("r24","14","07:15","+07:00","Safari matinal à 07 h 30","Check-out et bateau à 09 h 00."),
 R("r25","14","10:30","+07:00","Transfert vers Ao Nang","Faire confirmer par Las Orquideas l’heure du retour et la prise en charge."),
 R("r26","14","19:30","+07:00","Demain : Phi Phi à 08 h 00","Hall à 07 h 30. 800 THB de droits de parc, crème solaire respectueuse du milieu marin."),
 R("r27","15","07:00","+07:00","Prêt dans le hall à 07 h 30","Référence GYG6H73R6WB6. Maillot, serviette, 800 THB."),
 R("r28","15","20:00","+07:00","Demain : Railay","Longtail public vers 08 h 00, environ 100 THB par trajet et par personne."),
 R("r29","16","07:30","+07:00","Longtail vers Railay","Départ quand le bateau est plein. Retour avant 17 h."),
 R("r30","16","16:15","+07:00","Retour vers Ao Nang avant 17 h","La fréquence des bateaux baisse en fin de journée."),
 R("r31","16","19:00","+07:00","Demain : Hong Islands à 11 h 00","Pickup entre 09 h 30 et 10 h 45. 600 THB de droits de parc. Confirmer l’heure à la réception."),
 R("r32","17","09:00","+07:00","Attendre dans le hall","Fenêtre de prise en charge 09 h 30–10 h 45. Prévoir 600 THB."),
 R("r33","17","20:00","+07:00","Valises et transfert de demain","Confirmer le transfert privé Ao Nang → Mai Khao à 10 h 00."),
 R("r34","18","09:30","+07:00","Check-out Ao Nang à 10 h 00","Transfert direct vers Mai Khao avec les bagages."),
 R("r35","18","17:00","+07:00","Dernier coucher de soleil à Mai Khao","Sur la plage, vers 17 h 30."),
 R("r36","18","19:30","+07:00","Confirmer le taxi de 04 h 40","Demander la confirmation à la réception et un petit-déjeuner à emporter. Sacs et passeports prêts."),
 R("r37","19","04:00","+07:00","Réveil","Taxi à 04 h 40. Passeports et cartes d’embarquement."),
 R("r38","19","14:45","+03:00","Embarquement à Doha","QR037 à 15 h 40 vers Paris.")
];
