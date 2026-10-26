/* Catalogo della caviglia destra. Unità geometriche cm, X mediale, Y craniale,
   Z anteriore. Origine BP3D [-80,-60,60] mm. Campo: gamba distale e piede
   fino alle diafisi metatarsali; origini prossimali e dita sono fuori campo. */
export const CATS=[
 {id:'ossa',name:'Ossa',color:'#e8dcc0'}, {id:'cart',name:'Cartilagini',color:'#c3dae6'},
 {id:'leg',name:'Legamenti',color:'#e6e1d3'}, {id:'caps',name:'Capsule',color:'#b9cfe0'},
 {id:'ret',name:'Retinacoli',color:'#e6e1d3'}, {id:'ten',name:'Tendini',color:'#e6e1d3'},
 {id:'gua',name:'Guaine sinoviali',color:'#a8c2d8'},
 {id:'cin',name:'Muscoli anteriori',color:'#8e2f28'}, {id:'cuf',name:'Muscoli laterali',color:'#8e2f28'},
 {id:'tor',name:'Muscoli posteriori',color:'#8e2f28'}, {id:'brac',name:'Muscoli del piede',color:'#8e2f28'},
 {id:'art',name:'Arterie',color:'#b0221d'}, {id:'ven',name:'Vene',color:'#3a4a86'},
 {id:'ner',name:'Nervi',color:'#ecc85a'}, {id:'bor',name:'Borse',color:'#9fb8ec'},
 {id:'adi',name:'Tessuto adiposo',color:'#e4c166'}, {id:'tfl',name:'Fasce',color:'#e6e1d3'}
];
const bone=(id,fma,name,info)=>({id,cat:'ossa',name,info,fma});
const muscle=(id,fma,cat,name,o,ins,fn,cut,info)=>({id,cat,name,info,o,ins,fn,fma,cut});
export const BONES=[
 bone('tibia',24477,'Tibia distale','Plafond tibiale e malleolo mediale formano la parte mediale e superiore della mortasa. La diafisi è sezionata prossimalmente.'),
 bone('fibula',24480,'Fibula distale','Il malleolo laterale scende più distalmente e posteriormente rispetto al mediale. La fossa malleolare accoglie l’inserzione del talofibulare posteriore.'),
 bone('talo',24482,'Talo (astragalo)','Troclea, collo, testa e processi posteriori; il solco posteriore accoglie il flessore lungo dell’alluce. Non riceve inserzioni muscolari.'),
 bone('calcagno',24497,'Calcagno','Tuberosità posteriore, sustentaculum tali mediale e troclea fibulare laterale. Il seno del tarso separa le faccette subtalari anteriore e posteriore.'),
 bone('navicolare',24500,'Navicolare','La tuberosità mediale riceve il principale fascio del tibiale posteriore. Si articola con la testa del talo e i tre cuneiformi.'),
 bone('cuboide',24528,'Cuboide','Il solco plantare guida il tendine del fibulare lungo nel suo passaggio verso il primo raggio.'),
 ...[[24521,'mediale'],[24523,'intermedio'],[24525,'laterale']].map(([f,n],i)=>bone('cuneiforme'+(i+1),f,'Cuneiforme '+n,'Osso del mesopiede; riferimento distale per i tendini e le arcate del piede.')),
 ...[24507,24509,24511,24513,24515].map((f,i)=>bone('metatarso'+(i+1),f,'Metatarso '+(i+1)+' – base e diafisi','Segmento prossimale di riferimento. Testa metatarsale e dita non sono comprese in questa tavola della caviglia.'))
];
export const MUSCLES=[
 muscle('ta',22544,'cin','Tibiale anteriore','Condilo laterale e faccia laterale della tibia; membrana interossea.','Cuneiforme mediale e base del primo metatarso, versante mediale-plantare.','Dorsiflessione e inversione del piede.',4.5,'Il tendine passa anteriormente alla caviglia, medialmente agli estensori. Origine prossimale fuori campo.'),
 muscle('ehl',22546,'cin','Estensore lungo dell’alluce','Faccia anteriore della fibula e membrana interossea.','Base dorsale della falange distale dell’alluce (fuori campo).','Estensione dell’alluce e dorsiflessione.',3.0,'Il tendine passa tra tibiale anteriore ed estensore lungo delle dita.'),
 muscle('edl',22548,'cin','Estensore lungo delle dita','Condilo laterale tibiale, fibula anteriore e membrana interossea.','Espansioni dorsali delle dita II–V (fuori campo).','Estensione delle dita II–V e dorsiflessione.',2.5,'Le quattro espansioni digitali proseguono oltre il margine distale della tavola.'),
 muscle('ft',22550,'cin','Fibulare terzo','Terzo distale della faccia anteriore della fibula.','Base dorsale del quinto metatarso.','Dorsiflessione ed eversione.',1.5,'Decorso anterolaterale; muscolo variabile, presente nell’esemplare BodyParts3D.'),
 muscle('fl',22552,'cuf','Fibulare lungo','Testa e faccia laterale prossimale della fibula.','Cuneiforme mediale e base plantare del primo metatarso.','Eversione e sostegno dell’arco trasverso.',5.0,'Passa dietro il malleolo laterale, sotto la troclea fibulare e nel solco plantare del cuboide.'),
 muscle('fb',22554,'cuf','Fibulare breve','Due terzi distali della faccia laterale della fibula.','Tuberosità della base del quinto metatarso.','Eversione del piede.',1.5,'Nel solco retromalleolare è anteriore al fibulare lungo; sul calcagno passa sopra la troclea fibulare.'),
 muscle('tp',65018,'tor','Tibiale posteriore','Facce posteriori di tibia e fibula; membrana interossea.','Tuberosità del navicolare; espansioni al tarso e basi metatarsali II–IV.','Inversione, flessione plantare e sostegno dell’arco mediale.',3.5,'È il tendine più anteriore nel tunnel tarsale, subito dietro il malleolo mediale.'),
 muscle('fdl',65016,'tor','Flessore lungo delle dita','Faccia posteriore della tibia, sotto la linea del soleo.','Falangi distali delle dita II–V (fuori campo).','Flessione delle dita II–V e flessione plantare.',3.5,'Passa posteriormente al tibiale posteriore nel tunnel tarsale; incrocia il flessore lungo dell’alluce nella pianta.'),
 muscle('fhl',65014,'tor','Flessore lungo dell’alluce','Due terzi inferiori della faccia posteriore della fibula e membrana interossea.','Falange distale dell’alluce (fuori campo).','Flessione dell’alluce e contributo alla propulsione.',.7,'Scorre tra i tubercoli posteriori del talo e sotto il sustentaculum tali; è il tendine più posteriore nel tunnel tarsale.'),
 muscle('soleo',22558,'tor','Soleo','Testa e fibula prossimale, linea del soleo tibiale e arco tendineo.','Tuberosità posteriore del calcagno tramite il tendine calcaneale.','Flessione plantare e controllo posturale.',5.5,'Ventre distale profondo rispetto ai gastrocnemi. La porzione prossimale è fuori campo.'),
 muscle('gm',45957,'tor','Gastrocnemio – capo mediale','Regione posteriore del condilo mediale femorale (fuori campo).','Calcagno tramite il tendine calcaneale.','Flessione plantare e flessione del ginocchio.',9.5,'È rappresentata la porzione distale e la sua aponeurosi.'),
 muscle('gl',45960,'tor','Gastrocnemio – capo laterale','Condilo laterale femorale (fuori campo).','Calcagno tramite il tendine calcaneale.','Flessione plantare e flessione del ginocchio.',9.5,'È rappresentata la porzione distale e la sua aponeurosi.'),
 muscle('plantare',22560,'tor','Plantare','Linea sopracondiloidea laterale del femore (fuori campo).','Calcagno, medialmente al tendine calcaneale; inserzione variabile.','Debole flessione plantare e flessione del ginocchio.',13.0,'Lungo tendine sottile sul versante mediale del tendine calcaneale; il ventre prossimale è fuori campo.'),
 muscle('edb',51142,'brac','Estensore breve delle dita','Superficie superolaterale del calcagno.','Tendini estensori delle dita II–IV (fuori campo).','Estensione delle dita II–IV.',null,'Ricopre il versante dorsolaterale del retropiede; le terminazioni digitali sono escluse.'),
 muscle('ehb',51144,'brac','Estensore breve dell’alluce','Superficie superolaterale del calcagno.','Base della falange prossimale dell’alluce (fuori campo).','Estensione dell’alluce alla metatarsofalangea.',null,'Porzione mediale del gruppo estensore breve, mantenuta separata come nel dataset.'),
 muscle('abh',37459,'brac','Abduttore dell’alluce','Processo mediale della tuberosità calcaneale, retinacolo dei flessori e aponeurosi plantare.','Base mediale della falange prossimale dell’alluce (fuori campo).','Abduzione dell’alluce e sostegno dell’arco mediale.',null,'Il margine prossimale forma il limite superficiale dei tunnel plantari mediali.'),
 muscle('fdb',37461,'brac','Flessore breve delle dita','Processo mediale della tuberosità calcaneale e aponeurosi plantare.','Falangi medie delle dita II–V (fuori campo).','Flessione delle interfalangee prossimali II–V.',null,'Strato plantare superficiale, profondo all’aponeurosi.'),
 muscle('adm',37463,'brac','Abduttore del quinto dito','Processi mediale e laterale della tuberosità calcaneale.','Base laterale della falange prossimale del quinto dito (fuori campo).','Abduzione e flessione del quinto dito.',null,'Forma il margine laterale della pianta del piede.'),
 muscle('qp',37465,'brac','Quadrato della pianta','Facce mediale e laterale della superficie plantare del calcagno.','Margine posterolaterale del tendine del flessore lungo delle dita.','Raddrizza la trazione obliqua del flessore lungo delle dita.',null,'Secondo strato della pianta, profondo al flessore breve delle dita.')
];
export const ACHILLES={id:'achille',cat:'ten',fma:258847,name:'Tendine calcaneale (Achille)',info:'Geometria BodyParts3D. Tendine comune del tricipite surale; è privo di guaina sinoviale e avvolto da paratenon.',o:'Aponeurosi di soleo e gastrocnemi.',ins:'Terzo medio della faccia posteriore della tuberosità calcaneale.',fn:'Trasmette la forza di flessione plantare del tricipite surale.'};
