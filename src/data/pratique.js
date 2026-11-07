/* ====== PRATIQUE ====== */
const RESA = [
 ["Qatar Airways (aller-retour Paris)","88FXWZ","https://www.qatarairways.com/en/manage-booking.html"],
 ["AirAsia DMK → CNX · FD3427 (8 nov.)","GI76XK","https://www.airasia.com/my/en/manage/manage-my-booking.page"],
 ["AirAsia CNX → URT · FD5420 (11 nov.)","TK37HH","https://www.airasia.com/my/en/manage/manage-my-booking.page"],
 ["Hôtel Bangkok","6342.362.822",""],["Hôtel Chiang Mai","5782.569.090",""],["Hôtel Khao Sok","5914.749.986",""],
 ["Lac Cheow Lan (forfait Las Orquideas)","6 480 THB pour deux",""],
 ["Hôtel Ao Nang","6190.305.557",""],["Hôtel Phuket (Mai Khao)","6188.828.627",""],
 ["Doi Inthanon · 10 nov. 08 h 00","BK349730705118024",""],
 ["Phi Phi · 15 nov. 08 h 00","GYG6H73R6WB6",""],
 ["Hong Islands · Sylvain · 17 nov. 11 h 00","BK364041493320936",""],
 ["Hong Islands · 2e adulte · 17 nov. 11 h 00","BK352621916655631",""]
];
const CASH = [
 ["c1","Dépôt de garantie hôtel Bangkok (6 nov.)",500],
 ["c2","Doi Inthanon : parc 300 + pagodes 100 par personne (10 nov.)",800],
 ["c3","Las Orquideas : massage 800 + canoë 1 200 + ATV 2 200 (11–12 nov.)",4200],
 ["c4","Lac Cheow Lan : réserve si taxes non incluses (13 nov.)",680],
 ["c5","Phi Phi : droits de parc (15 nov.)",800],
 ["c6","Railay : longtail partagé aller-retour pour deux (16 nov.)",400],
 ["c7","Hong Islands : droits de parc (17 nov.)",600]
];
const CHECKS = [
 ["Avant de partir",[
  ["k1","Confirmations et références en capture d’écran, hors ligne"],
  ["k2","TDAC (carte d’arrivée numérique) remplie dans le délai officiel"],
  ["k3","Passeports, assurance, copies numériques séparées"],
  ["k4","Confirmation écrite de Las Orquideas : taxes du lac incluses"],
  ["k5","Chauffeur Ayutthaya (8 nov.) réservé : bagages, multi-arrêts, dépose DMK"],
  ["k6","Transfert URT → Khao Sok (11 nov.) réservé"],
  ["k7","Transfert Las Orquideas → Ao Nang (14 nov.) réservé, prise en charge flexible"],
  ["k8","Transfert Ao Nang → Mai Khao (18 nov.) réservé"],
  ["k9","Taxi Mai Khao → HKT à 04 h 40 (19 nov.) réservé"]]],
 ["Dans le sac",[
  ["b1","Petit sac étanche et housse de pluie"],
  ["b2","Chaussures fermées et sandales"],
  ["b3","Répulsif et crème solaire respectueuse du milieu marin"],
  ["b4","Tenue couvrante légère pour les temples, foulard"],
  ["b5","Maillot, lampe frontale, batterie externe"],
  ["b6","Traitements personnels, ordonnance, trousse simple"]]],
 ["Rappels de sécurité",[
  ["s1","Passeports, argent et électronique jamais laissés dans un coffre de véhicule pendant les visites"],
  ["s2","Sortie en bateau annulée si l’opérateur ou les autorités signalent des conditions dangereuses"],
  ["s3","Khao Sok : pas de sentier long ou fermé en solo, suivre les consignes du parc"],
  ["s4","Marge avant chaque vol : circulation et météo peuvent ralentir les transferts"]]]
];
const URG = [["Police touristique","1155"],["Urgences médicales","1669"],["Numéro d’urgence général","191"]];
const THAI = [
 ["Bonjour / Au revoir","sa-wat-dii khrap (homme) · sa-wat-dii kha (femme)"],
 ["Merci","khop khun khrap / kha"],
 ["Combien ça coûte ?","tao-raï ?"],
 ["Un peu moins cher, s’il vous plaît","lot noï dâi mai ?"],
 ["Non merci","mai ao khrap / kha"],
 ["Pas piquant","mai phet"],
 ["Un peu piquant","phet noï"],
 ["Je mange végétarien","kin jay"],
 ["L’addition","chek bin"],
 ["Toilettes ?","hong nam yu tï nai ?"],
 ["Au compteur, s’il vous plaît","meter khrap / kha"],
 ["Excusez-moi / Pardon","kho thot"],
 ["De l’eau","nam"],
 ["Sans glace","mai sai nam khèng"]
];
