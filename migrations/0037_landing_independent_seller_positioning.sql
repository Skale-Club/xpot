-- Phase-one landing positioning: Xpot is currently offered to independent
-- sellers earning extra income with selected products. Keep any saved
-- account-dialog and phone-mockup copy, but replace every public marketing
-- section and remove the retired enterprise/CRM block.

UPDATE "landing_page_contents"
SET "content" = ("content" - 'sync') || $json$
{
  "navigation": {"audience":"Who it's for","how":"How it works","faq":"FAQ"},
  "hero": {
    "badge":"Your side hustle, organized by Xpot",
    "titleLine1":"Turn your free time into",
    "titleLine2":"extra income.",
    "body":"Buy selected products, choose when and where to sell, and use Xpot to find nearby businesses, plan your route, check in and keep every sale organized.",
    "secondaryCta":"See how it works",
    "accessNote":"The Xpot team reviews every new account before you start selling."
  },
  "audience": {
    "title":"Made for people who want to earn on their own terms",
    "subtitle":"Start a side hustle that fits around the work and responsibilities you already have.",
    "cards":[
      {"imageUrl":"/landing/highlights/prospecting-route.webp","title":"Looking for extra income","body":"Turn a few free hours into a focused selling shift without giving up your main job or routine."},
      {"imageUrl":"/landing/highlights/visit-note.webp","title":"Already out and about","body":"If your work already takes you around town, add nearby business visits to the route you already make."},
      {"imageUrl":"/landing/highlights/nfc-activation.webp","title":"Prefer to work independently","body":"Choose your selling hours, manage your own stops and see what you sold and earned."}
    ]
  },
  "how": {"title":"One app from your first stop to your last sale","subtitle":"Xpot guides your day so you can focus on meeting businesses and selling."},
  "tools": {"cards":[
    {"title":"Find places and plan your route","items":["Choose the city and types of business you want to visit","Plan a selling shift from 2 to 12 hours","Preview the map and visit stops in a practical order","Use the same optimized route throughout your shift"]},
    {"title":"Visit with confidence","items":["Confirm check-in and check-out with GPS","Record a quick voice note instead of typing everything","Save the result: sold, follow up or no answer","Always know which place comes next"]},
    {"title":"Track sales and earnings","items":["Record products, discounts and payments","Keep track of the products you carry and leave on consignment","Organize customer settlements and pending amounts","See what you earned from every sale"]},
    {"title":"Offer QR and NFC products","items":["Counter displays, table plaques and keychains with QR and NFC","Point each piece to Google reviews, Instagram or any link","Write and verify the NFC chip from the phone","Track scans by piece and by customer"]}
  ]},
  "faq": {
    "title":"Questions before you start selling",
    "subtitle":"What to know about access, daily use and earning with Xpot.",
    "items":[
      {"id":"faq-1","question":"Who is Xpot designed for?","answer":"Xpot is for independent people who want to earn extra income by selling selected products to local businesses on a flexible schedule."},
      {"id":"faq-2","question":"Do I need sales experience?","answer":"No. Xpot guides you through the route, each visit and the next step. You can record a quick voice note and keep moving without filling out long forms."},
      {"id":"faq-3","question":"How do I plan my selling day?","answer":"Choose the city, the types of business and how many hours you have. Xpot finds nearby opportunities, orders the stops and opens directions for you."},
      {"id":"faq-4","question":"How do I earn money with Xpot?","answer":"You buy the products available in Xpot and resell them to local businesses. Your earnings come from the margin on each sale, with products, prices and terms shown before you start."},
      {"id":"faq-5","question":"What can we do with QR and NFC pieces?","answer":"You can assign each piece to a customer, point it to a review page or another destination, write compatible NFC chips and follow scans by piece and customer."},
      {"id":"faq-6","question":"How do new accounts get access?","answer":"The Xpot team reviews every new account before activation. Once approved, you can access the available products and start organizing your selling days."}
    ]
  },
  "cta":{"title":"Ready to turn free time into extra income?","body":"Create your account, get approved and use Xpot to plan your route, visit businesses and keep your sales organized.","button":"I want to get started"},
  "footer":{"tagline":"Xpot | Your route to extra income.","privacyLabel":"Privacy Policy","termsLabel":"Terms of Service","rights":"© {year} Xpot."}
}
$json$::jsonb,
"updated_at" = NOW()
WHERE "locale" = 'en';

UPDATE "landing_page_contents"
SET "content" = ("content" - 'sync') || $json$
{
  "navigation": {"audience":"Para quem é","how":"Como funciona","faq":"Dúvidas"},
  "hero": {
    "badge":"Sua renda extra, organizada pelo Xpot",
    "titleLine1":"Transforme seu tempo livre em",
    "titleLine2":"renda extra.",
    "body":"Compre produtos selecionados, escolha quando e onde vender e use o Xpot para encontrar comércios próximos, montar sua rota, fazer check-in e organizar cada venda.",
    "secondaryCta":"Ver como funciona",
    "accessNote":"A equipe do Xpot revisa cada nova conta antes de você começar a vender."
  },
  "audience": {
    "title":"Feito para quem quer ganhar no próprio ritmo",
    "subtitle":"Comece uma renda extra que cabe junto do trabalho e das responsabilidades que você já tem.",
    "cards":[
      {"imageUrl":"/landing/highlights/prospecting-route.webp","title":"Quer uma renda extra","body":"Transforme algumas horas livres em um turno de vendas sem abrir mão do seu trabalho principal ou da sua rotina."},
      {"imageUrl":"/landing/highlights/visit-note.webp","title":"Já passa o dia na rua","body":"Se o seu trabalho já faz você circular pela cidade, inclua visitas a comércios próximos no caminho que você já percorre."},
      {"imageUrl":"/landing/highlights/nfc-activation.webp","title":"Prefere trabalhar por conta própria","body":"Escolha seus horários, cuide das próprias paradas e acompanhe o que vendeu e quanto ganhou."}
    ]
  },
  "how": {"title":"Um app da primeira parada até a última venda","subtitle":"O Xpot orienta seu dia para você focar em conhecer comércios e vender."},
  "tools": {"cards":[
    {"title":"Encontre lugares e planeje sua rota","items":["Escolha a cidade e os tipos de comércio que quer visitar","Monte um turno de vendas de 2 a 12 horas","Veja o mapa e as paradas em uma ordem prática","Use a mesma rota otimizada durante todo o turno"]},
    {"title":"Faça visitas com confiança","items":["Confirme check-in e check-out pelo GPS","Grave um áudio rápido em vez de digitar tudo","Salve o resultado: vendeu, retornar ou não atendeu","Saiba sempre qual é o próximo lugar da rota"]},
    {"title":"Acompanhe vendas e ganhos","items":["Registre produtos, descontos e pagamentos","Controle os produtos que leva e deixa em consignação","Organize acertos e valores pendentes de cada cliente","Veja quanto ganhou em cada venda"]},
    {"title":"Ofereça produtos com QR e NFC","items":["Displays de balcão, plaquinhas de mesa e chaveiros com QR e NFC","Direcione cada peça para avaliações no Google, Instagram ou qualquer link","Grave e confira o chip NFC pelo próprio celular","Acompanhe as leituras por peça e por cliente"]}
  ]},
  "faq": {
    "title":"Dúvidas antes de começar a vender",
    "subtitle":"O que você precisa saber sobre acesso, uso diário e renda com o Xpot.",
    "items":[
      {"id":"faq-1","question":"Para quem o Xpot foi criado?","answer":"O Xpot é para pessoas independentes que querem ganhar uma renda extra vendendo produtos selecionados para comércios locais, com horários flexíveis."},
      {"id":"faq-2","question":"Preciso ter experiência com vendas?","answer":"Não. O Xpot orienta a rota, cada visita e o próximo passo. Você pode gravar um áudio rápido e seguir em frente sem preencher formulários longos."},
      {"id":"faq-3","question":"Como planejo meu dia de vendas?","answer":"Escolha a cidade, os tipos de comércio e quantas horas você tem. O Xpot encontra oportunidades próximas, ordena as paradas e abre o trajeto para você."},
      {"id":"faq-4","question":"Como ganho dinheiro com o Xpot?","answer":"Você compra os produtos disponíveis no Xpot e revende para comércios locais. Seu ganho vem da margem de cada venda, com produtos, preços e condições apresentados antes de começar."},
      {"id":"faq-5","question":"O que podemos fazer com peças QR e NFC?","answer":"Você pode vincular cada peça a um cliente, apontá-la para avaliações ou outro destino, gravar chips NFC compatíveis e acompanhar leituras."},
      {"id":"faq-6","question":"Como novas contas recebem acesso?","answer":"A equipe do Xpot revisa cada nova conta antes da ativação. Depois de aprovado, você acessa os produtos disponíveis e começa a organizar seus dias de venda."}
    ]
  },
  "cta":{"title":"Pronto para transformar tempo livre em renda extra?","body":"Crie sua conta, receba a aprovação e use o Xpot para planejar sua rota, visitar comércios e organizar suas vendas.","button":"Quero começar"},
  "footer":{"tagline":"Xpot | Sua rota para uma renda extra.","privacyLabel":"Política de Privacidade","termsLabel":"Termos de Uso","rights":"© {year} Xpot."}
}
$json$::jsonb,
"updated_at" = NOW()
WHERE "locale" = 'pt';

UPDATE "landing_page_contents"
SET "content" = ("content" - 'sync') || $json$
{
  "navigation": {"audience":"Para quién es","how":"Cómo funciona","faq":"Preguntas"},
  "hero": {
    "badge":"Tus ingresos extra, organizados por Xpot",
    "titleLine1":"Convierte tu tiempo libre en",
    "titleLine2":"ingresos extra.",
    "body":"Compra productos seleccionados, elige cuándo y dónde vender y usa Xpot para encontrar comercios cercanos, crear tu ruta, hacer check-in y organizar cada venta.",
    "secondaryCta":"Ver cómo funciona",
    "accessNote":"El equipo de Xpot revisa cada cuenta nueva antes de que empieces a vender."
  },
  "audience": {
    "title":"Hecho para quienes quieren ganar a su propio ritmo",
    "subtitle":"Empieza un ingreso extra que se adapte al trabajo y a las responsabilidades que ya tienes.",
    "cards":[
      {"imageUrl":"/landing/highlights/prospecting-route.webp","title":"Buscas ingresos extra","body":"Convierte unas horas libres en un turno de ventas sin dejar tu trabajo principal ni cambiar tu rutina."},
      {"imageUrl":"/landing/highlights/visit-note.webp","title":"Ya pasas el día en la calle","body":"Si tu trabajo ya te hace recorrer la ciudad, añade visitas a comercios cercanos al camino que ya haces."},
      {"imageUrl":"/landing/highlights/nfc-activation.webp","title":"Prefieres trabajar por tu cuenta","body":"Elige tus horarios, organiza tus propias paradas y sigue lo que vendiste y cuánto ganaste."}
    ]
  },
  "how": {"title":"Una app desde la primera parada hasta la última venta","subtitle":"Xpot orienta tu día para que te concentres en conocer comercios y vender."},
  "tools": {"cards":[
    {"title":"Encuentra lugares y planifica tu ruta","items":["Elige la ciudad y los tipos de comercio que quieres visitar","Crea un turno de ventas de 2 a 12 horas","Mira el mapa y las paradas en un orden práctico","Usa la misma ruta optimizada durante todo tu turno"]},
    {"title":"Visita con confianza","items":["Confirma check-in y check-out mediante GPS","Graba un audio rápido en vez de escribir todo","Guarda el resultado: vendió, seguimiento o no atendió","Ten siempre claro cuál es el próximo lugar de la ruta"]},
    {"title":"Sigue ventas y ganancias","items":["Registra productos, descuentos y pagos","Controla los productos que llevas y dejas en consignación","Organiza liquidaciones y saldos pendientes de cada cliente","Mira cuánto ganaste en cada venta"]},
    {"title":"Ofrece productos con QR y NFC","items":["Exhibidores de mostrador, placas de mesa y llaveros con QR y NFC","Dirige cada pieza a reseñas de Google, Instagram o cualquier enlace","Graba y verifica el chip NFC desde el teléfono","Sigue las lecturas por pieza y por cliente"]}
  ]},
  "faq": {
    "title":"Preguntas antes de empezar a vender",
    "subtitle":"Lo que necesitas saber sobre acceso, uso diario e ingresos con Xpot.",
    "items":[
      {"id":"faq-1","question":"¿Para quién fue creado Xpot?","answer":"Xpot es para personas independientes que quieren ganar ingresos extra vendiendo productos seleccionados a comercios locales, con horarios flexibles."},
      {"id":"faq-2","question":"¿Necesito experiencia en ventas?","answer":"No. Xpot orienta la ruta, cada visita y el próximo paso. Puedes grabar un audio rápido y seguir adelante sin completar formularios largos."},
      {"id":"faq-3","question":"¿Cómo planifico mi día de ventas?","answer":"Elige la ciudad, los tipos de comercio y cuántas horas tienes. Xpot encuentra oportunidades cercanas, ordena las paradas y abre el trayecto para ti."},
      {"id":"faq-4","question":"¿Cómo gano dinero con Xpot?","answer":"Compras los productos disponibles en Xpot y los revendes a comercios locales. Tu ganancia viene del margen de cada venta, con productos, precios y condiciones visibles antes de empezar."},
      {"id":"faq-5","question":"¿Qué podemos hacer con piezas QR y NFC?","answer":"Puedes vincular cada pieza a un cliente, dirigirla a reseñas u otro destino, grabar chips NFC compatibles y seguir sus lecturas."},
      {"id":"faq-6","question":"¿Cómo obtienen acceso las cuentas nuevas?","answer":"El equipo de Xpot revisa cada cuenta nueva antes de activarla. Después de la aprobación, accedes a los productos disponibles y empiezas a organizar tus días de venta."}
    ]
  },
  "cta":{"title":"¿Listo para convertir tu tiempo libre en ingresos extra?","body":"Crea tu cuenta, recibe la aprobación y usa Xpot para planificar tu ruta, visitar comercios y organizar tus ventas.","button":"Quiero empezar"},
  "footer":{"tagline":"Xpot | Tu ruta hacia ingresos extra.","privacyLabel":"Política de Privacidad","termsLabel":"Términos del Servicio","rights":"© {year} Xpot."}
}
$json$::jsonb,
"updated_at" = NOW()
WHERE "locale" = 'es';
