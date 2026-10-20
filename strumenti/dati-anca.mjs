/* Anca destra: catalogo delle geometrie BodyParts3D e schede.
   Master per bozza-anca.mjs. Le ricostruzioni hanno fma=null.
   Prima versione didattica: le impronte tendinee e le strutture procedurali
   richiedono revisione anatomica prima della pubblicazione. */
export const CATS=[
 {id:'ossa',name:'Ossa',color:'#e8dcc0'},
 {id:'cart',name:'Cartilagine',color:'#c3dae6'},
 {id:'men',name:'Labbro',color:'#d6c5ac'},
 {id:'leg',name:'Legamenti',color:'#e6e1d3'},
 {id:'caps',name:'Capsula',color:'#b9cfe0'},
 {id:'cin',name:'Glutei',color:'#8e2f28'},
 {id:'cuf',name:'Rotatori profondi',color:'#8e2f28'},
 {id:'tor',name:'Flessori',color:'#8e2f28'},
 {id:'brac',name:'Adduttori e posteriori',color:'#8e2f28'},
 {id:'tfl',name:'Fascia',color:'#e6e1d3'}
];
const bone=(id,fma,name,info)=>({id,fma,cat:'ossa',name,info});
const muscle=(id,fma,cat,name,o,ins,fn,tip,info)=>({id,fma,cat,name,o,ins,fn,tip,info});
const joint=(id,cat,name,info,o,ins,fn)=>({id,fma:null,cat,name,info:'Ricostruzione didattica da verificare. '+info,...(o?{o,ins,fn}:{})});
export const STR=[
 bone('coxale',16586,'Osso coxale destro','Ileo, ischio e pube delimitano l’acetabolo e il forame otturatorio. Geometria BodyParts3D; i dettagli minuti dipendono dalla risoluzione del dataset.'),
 bone('femore',24474,'Femore prossimale destro','Testa, collo, grande e piccolo trocantere. Il segmento diafisario è sezionato per concentrare la tavola sull’anca.'),
 bone('sacro',16202,'Sacro','Riferimento posteriore del bacino. La tavola comprende il sacro intero e il solo osso coxale destro.'),
 muscle('gmax',22328,'cin','Grande gluteo','Ileo posteriore, sacro, coccige e legamento sacrotuberoso.','Tratto ileotibiale e tuberosità glutea.','Estensione e rotazione esterna dell’anca.',[-4,-7,-3],'Strato superficiale posteriore. Le fibre e la transizione tendinea sono una rappresentazione grafica indicativa.'),
 muscle('gmed',22330,'cin','Medio gluteo','Faccia glutea dell’ileo tra le linee glutee anteriore e posteriore.','Facce laterale e superoposteriore del grande trocantere.','Abduzione e stabilizzazione del bacino nell’appoggio monopodalico.',[-5,-1,-1],'Copre il piccolo gluteo; le impronte dei singoli fasci non sono segmentate in questa versione.'),
 muscle('gmin',22332,'cin','Piccolo gluteo','Faccia glutea dell’ileo tra le linee glutee anteriore e inferiore.','Faccia anteriore del grande trocantere.','Abduzione e stabilizzazione dell’anca.',[-5,-1,1],'Muscolo profondo rispetto al medio gluteo. La parte anteriore contribuisce alla rotazione interna.'),
 muscle('tensore',22425,'cin','Tensore della fascia lata','Spina iliaca anteriore superiore e tratto anteriore della cresta iliaca.','Tratto ileotibiale.','Tensione della fascia lata; flessione, abduzione e rotazione interna dell’anca.',[-6,-10,1],'Il tratto distale è sezionato insieme alla coscia.'),
 muscle('piriforme',22340,'cuf','Piriforme','Faccia pelvica del sacro.','Margine superiore del grande trocantere.','Rotazione esterna dell’anca estesa e abduzione dell’anca flessa.',[-4,-1,-1],'Attraversa il grande forame ischiatico. Non sono rappresentate varianti di decorso.'),
 muscle('ott_int',22324,'cuf','Otturatore interno','Faccia interna della membrana otturatoria e contorno osseo.','Faccia mediale del grande trocantere.','Rotazione esterna e stabilizzazione dell’anca.',[-4,-2,-1],'Il tendine cambia direzione in corrispondenza della piccola incisura ischiatica.'),
 muscle('ott_est',22326,'cuf','Otturatore esterno','Faccia esterna della membrana otturatoria e contorno osseo.','Fossa trocanterica.','Rotazione esterna e stabilizzazione della testa femorale.',[-3,-2,-1],'Passa inferiormente al collo femorale prima di raggiungere la fossa trocanterica.'),
 muscle('gem_sup',22334,'cuf','Gemello superiore','Spina ischiatica.','Tendine dell’otturatore interno verso il grande trocantere.','Rotazione esterna e stabilizzazione dell’anca.',[-4,-2,-1],'Affianca superiormente il tendine dell’otturatore interno.'),
 muscle('gem_inf',22336,'cuf','Gemello inferiore','Tuberosità ischiatica.','Tendine dell’otturatore interno verso il grande trocantere.','Rotazione esterna e stabilizzazione dell’anca.',[-4,-2,-1],'Affianca inferiormente il tendine dell’otturatore interno.'),
 muscle('quadrato',22338,'cuf','Quadrato del femore','Margine laterale della tuberosità ischiatica.','Tubercolo quadrato e cresta intertrocanterica.','Rotazione esterna e contributo all’adduzione.',[-4,-4,-2],'Occupa lo spazio tra ischio e femore prossimale.'),
 muscle('iliaco',22322,'tor','Iliaco','Fossa iliaca.','Piccolo trocantere, con il tendine dell’ileopsoas.','Flessione dell’anca.',[-2,-6,-.2],'Il muscolo converge con il grande psoas anteriormente all’articolazione.'),
 muscle('psoas',22342,'tor','Grande psoas','Corpi, dischi e processi trasversi del tratto toracolombare.','Piccolo trocantere, con l’iliaco.','Flessione dell’anca e stabilizzazione lombopelvica.',[-2,-6,-.2],'Il tratto lombare è tagliato al margine superiore della tavola: l’origine completa non è rappresentata.'),
 muscle('retto',38928,'tor','Retto femorale','Spina iliaca anteriore inferiore e regione sopra-acetabolare.','Rotula attraverso il tendine quadricipitale; tibia attraverso il legamento patellare.','Flessione dell’anca ed estensione del ginocchio.',[-3,-15,4],'È rappresentato il tratto prossimale; i due tendini di origine non sono separati.'),
 muscle('sartorio',22354,'tor','Sartorio','Spina iliaca anteriore superiore.','Tibia prossimale mediale, nella zampa d’oca.','Flessione, abduzione e rotazione esterna dell’anca; flessione del ginocchio.',[3,-15,2],'Attraversa obliquamente la superficie anteriore della coscia; l’inserzione distale è fuori tavola.'),
 muscle('pettineo',22450,'brac','Pettineo','Pettine del pube.','Linea pettinea del femore.','Adduzione e flessione dell’anca.',[-2,-9,-1],'Muscolo prossimale del compartimento mediale della coscia.'),
 muscle('add_breve',22452,'brac','Adduttore breve','Corpo e ramo inferiore del pube.','Tratto prossimale della linea aspra.','Adduzione dell’anca.',[-2,-12,-2],'Profondo rispetto a pettineo e adduttore lungo.'),
 muscle('add_lungo',22456,'brac','Adduttore lungo','Corpo del pube.','Terzo medio della linea aspra del femore.','Adduzione dell’anca.',[-1,-15,-1],'Il tratto distale e l’inserzione completa non sono compresi nel campo.'),
 muscle('add_grande',22459,'brac','Grande adduttore','Ramo ischiopubico e tuberosità ischiatica.','Linea aspra, linea sopracondiloidea mediale e tubercolo dell’adduttore.','Adduzione; la porzione ischiocrurale contribuisce all’estensione.',[-1,-15,-3],'Le porzioni adduttoria e ischiocrurale non sono separate nel dataset utilizzato.'),
 muscle('gracile',43883,'brac','Gracile','Corpo e ramo inferiore del pube.','Tibia prossimale mediale, nella zampa d’oca.','Adduzione dell’anca e flessione del ginocchio.',[5,-15,0],'È visibile il segmento prossimale sul versante mediale della coscia.'),
 muscle('semitend',22358,'brac','Semitendinoso','Tuberosità ischiatica, con il capo lungo del bicipite femorale.','Tibia prossimale mediale, nella zampa d’oca.','Estensione dell’anca e flessione del ginocchio.',[1,-15,-5],'Tavola limitata all’origine e al ventre prossimale.'),
 muscle('semimemb',22448,'brac','Semimembranoso','Tuberosità ischiatica.','Condilo mediale della tibia, posteriormente.','Estensione dell’anca e flessione del ginocchio.',[2,-15,-5],'Origine prossimale larga e tendinea; inserzione distale fuori campo.'),
 muscle('bicipite',45888,'brac','Bicipite femorale – capo lungo','Tuberosità ischiatica.','Testa della fibula.','Estensione dell’anca e flessione del ginocchio.',[-3,-15,-5],'È rappresentato il tratto prossimale del solo capo lungo.'),
 {id:'tit',fma:58776,cat:'tfl',name:'Tratto ileotibiale',info:'Fascia laterale della coscia; il segmento distale è sezionato. Geometria BodyParts3D.',o:'Cresta iliaca; contributi di tensore della fascia lata e grande gluteo.',ins:'Tubercolo di Gerdy della tibia.',fn:'Stabilizzazione laterale dell’anca e del ginocchio.'},
 joint('cart_testa','cart','Cartilagine della testa femorale','Riveste la testa rispettando la fovea, individuata dalla depressione ossea. Superficie aderente alla mesh; margine e spessore ricostruiti, non segmentati.'),
 joint('cart_acet','cart','Cartilagine acetabolare','Rivestimento della superficie semilunare, con fossa centrale e incisura inferiori libere. Il margine segue il coxale; spessore adattato allo spazio tra le ossa.'),
 joint('labbro','men','Labbro acetabolare','Orlo fibrocartilagineo a sezione triangolare sul margine acetabolare, interrotto inferiormente dal legamento trasverso. Aumenta profondità e tenuta articolare; ricostruzione non segmentata.'),
 joint('capsula','caps','Capsula articolare','Involucro dal margine acetabolare al collo femorale: raggiunge anteriormente la linea intertrocanterica e resta più prossimale posteriormente. Nascosto all’avvio; impronte ricostruite.'),
 joint('iliofemorale','leg','Legamento ileofemorale','Due bande anteriori a Y, ricostruite come rinforzi del mantello capsulare. Le impronte non sono segmentate.', 'Regione della spina iliaca anteriore inferiore e margine acetabolare adiacente.','Linea intertrocanterica.','Limita soprattutto l’estensione e la rotazione esterna.'),
 joint('pubofemorale','leg','Legamento pubofemorale','Rinforzo anteroinferiore della capsula.', 'Ramo superiore del pube e margine acetabolare pubico.','Capsula inferiore e regione inferiore della linea intertrocanterica.','Limita l’abduzione e contribuisce al controllo dell’estensione.'),
 joint('ischiofemorale','leg','Legamento ischiofemorale','Rinforzo capsulare posteriore con decorso obliquo verso il collo.', 'Margine acetabolare ischiatico.','Collo femorale e regione mediale del grande trocantere.','Contribuisce al controllo della rotazione interna e dell’estensione.'),
 joint('trasverso','leg','Legamento trasverso dell’acetabolo','Ponte sull’incisura acetabolare inferiore.', 'Estremo anteriore dell’incisura acetabolare.','Estremo posteriore dell’incisura acetabolare.','Completa inferiormente il contorno acetabolare.'),
 joint('rotondo','leg','Legamento della testa del femore','Ventaglio intra-articolare dai margini dell’incisura e dal trasverso alla fovea. Decorso e larghezza sono ricostruiti.', 'Margini dell’incisura acetabolare e legamento trasverso.','Fovea della testa del femore.','Contributo alla stabilità e alla propriocezione articolare.')
];
