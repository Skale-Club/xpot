// Privacy Policy and Terms of Service, in the app's three languages.
//
// Written from what the code actually does (see the data inventory in the PR
// that added these pages): keep them in step when that changes — a new
// processor, a new kind of data, a retention job. Not legal advice: have a
// lawyer review before relying on them.

import type { Lang } from "@/i18n";

/** A paragraph, a bulleted list, or a paragraph opened by a bold label. */
export type LegalBlock = string | { list: string[] } | { lead: string; text: string };
export type LegalSection = { heading: string; body: LegalBlock[] };
export type LegalDoc = { title: string; updated: string; intro: string; sections: LegalSection[] };

export const LEGAL_UPDATED = "2026-10-04";

const privacyEn: LegalDoc = {
  title: "Privacy Policy",
  updated: "Last updated: October 4, 2026",
  intro:
    "Xpot (xpot.place) is a field sales app operated by Skale Club (“we”, “us”). This policy explains what we collect from the people who use the app (sales reps, managers and admins), what we keep about the businesses and contacts recorded in it, and what we record when someone scans an Xpot QR or NFC piece.",
  sections: [
    {
      heading: "1. Who is responsible",
      body: [
        "Skale Club operates Xpot and decides how the data described here is used. If you use Xpot for a company that works with us, that company also decides how its own customer data is used. You can reach us through the contact at the end of this page.",
      ],
    },
    {
      heading: "2. What we collect",
      body: [
        { lead: "Account", text: "Your phone number, name, and, if you give them, your email and profile photo. To sign in we text a 6-digit code; we keep only a hash of it, and it expires after 10 minutes. If you sign in with Google, we receive your name and email from Google." },
        { lead: "Location", text: "When you check in or out of a visit we record your GPS position, its accuracy and the distance to the business. While the Check-in screen is open, the app follows your position to validate the visit and draw the map; it is sent to our server to draw the map and is not stored between check-in and check-out. The app does not follow your location when that screen is closed, and on a computer it does not ask for location." },
        { lead: "Visit content", text: "Voice notes you record (we keep the audio), their transcript and the AI summary, photos you add, the visit outcome and your notes." },
        { lead: "Business data you enter", text: "Businesses and their addresses, people at those businesses (name, role, phone, email), products, sales, stock left on consignment, opportunities and tasks." },
        { lead: "QR and NFC scans", text: "When anyone scans an Xpot piece we do not store their IP address. We store the time, the device type, the operating system and browser family, the referring website’s domain, whether it looks like a bot, and an anonymous key that changes every day, used only to count unique visitors. We may store the country." },
        { lead: "Technical data", text: "A session cookie that keeps you signed in for 30 days and renews while you use the app, and settings saved in your browser (language, last module used, recently opened pieces). We do not use advertising or analytics trackers." },
      ],
    },
    {
      heading: "3. How we use it",
      body: [
        {
          list: [
            "To run the app: check-ins, maps, customers, sales, stock and pieces.",
            "To confirm that visits really happened at the customer’s location.",
            "To transcribe and summarize voice notes and suggest actions, which you confirm before anything is recorded.",
            "To send data to the CRM your team connects (for example Xphere or GoHighLevel).",
            "To send sign-in codes and notify our team about new sign-ups.",
            "To show managers and admins the activity of their team.",
            "To keep the service secure and prevent abuse.",
          ],
        },
        "We do not sell personal data and we do not use it for advertising.",
      ],
    },
    {
      heading: "4. Service providers",
      body: [
        "We use these providers to run Xpot. They process data only to provide their service to us:",
        {
          list: [
            "Hetzner, through Coolify: hosting and database.",
            "Supabase: sign-in and file storage (photos, profile pictures, voice notes).",
            "Twilio: text messages with sign-in codes.",
            "Groq and OpenAI: transcription of voice notes (they receive the audio).",
            "OpenRouter and Google Gemini: summaries and suggested actions (they receive the transcript, the business name and your product list).",
            "Google Maps Platform: place search and maps (they receive the search text and coordinates).",
            "Xphere and GoHighLevel: CRM sync, when your team connects them.",
            "Stuscle store: checking wholesale codes.",
          ],
        },
        "Some of these providers are in the United States or other countries, so your data may be processed outside the country where you live.",
      ],
    },
    {
      heading: "5. Who can see your data",
      body: [
        "Managers and admins of your team can see the visits, sales and customers of the reps they manage. Skale Club staff can access data to support and operate the service. The CRMs your team connects receive what is synced to them.",
      ],
    },
    {
      heading: "6. Files and links",
      body: [
        "Photos, profile pictures and voice notes are stored with long links that cannot be guessed. Anyone who has one of those links can open the file, so do not share them outside your team.",
      ],
    },
    {
      heading: "7. How long we keep it",
      body: [
        "We keep your data while your account is active and for as long as it is needed for the business relationship. Sign-in codes are deleted after use and sessions expire after 30 days without use. Deleting a business or a visit in the app removes it from the app; to delete the stored files or your whole account, contact us and we will do it.",
      ],
    },
    {
      heading: "8. Your rights",
      body: [
        "Depending on where you live (for example under the LGPD in Brazil, the GDPR in Europe or the CCPA in California), you can ask to access, correct, export or delete your data, or object to how it is used. People at businesses recorded in Xpot can make the same requests. Contact us and we will reply within 30 days.",
      ],
    },
    {
      heading: "9. Security",
      body: [
        "Traffic is encrypted (HTTPS), sign-in codes and access tokens are stored as hashes, the session cookie cannot be read by scripts, and what each person sees depends on their role. No system is completely secure, so tell us right away if you notice anything wrong.",
      ],
    },
    {
      heading: "10. Children",
      body: ["Xpot is a tool for businesses and is not meant for anyone under 18."],
    },
    {
      heading: "11. Changes",
      body: [
        "When we change this policy we update the date at the top. If the change is significant, we will also tell you in the app.",
      ],
    },
  ],
};

const privacyPt: LegalDoc = {
  title: "Política de Privacidade",
  updated: "Atualizada em 4 de outubro de 2026",
  intro:
    "O Xpot (xpot.place) é um app de vendas externas operado pela Skale Club (“nós”). Esta política explica o que coletamos de quem usa o app (vendedores, gestores e administradores), o que guardamos sobre as empresas e os contatos cadastrados nele e o que registramos quando alguém escaneia uma peça QR ou NFC do Xpot.",
  sections: [
    {
      heading: "1. Quem é o responsável",
      body: [
        "A Skale Club opera o Xpot e decide como os dados descritos aqui são usados. Se você usa o Xpot por uma empresa que trabalha conosco, essa empresa também decide como os dados dos clientes dela são usados. Fale conosco pelo contato no fim desta página.",
      ],
    },
    {
      heading: "2. O que coletamos",
      body: [
        { lead: "Conta", text: "Seu número de celular, seu nome e, se você informar, seu e-mail e sua foto de perfil. Para entrar, enviamos um código de 6 dígitos por SMS; guardamos só um hash dele, e ele vale por 10 minutos. Se você entrar com o Google, recebemos dele seu nome e e-mail." },
        { lead: "Localização", text: "No check-in e no check-out registramos sua posição de GPS, a precisão e a distância até a empresa. Com a tela de Check-in aberta, o app acompanha sua posição para validar a visita e desenhar o mapa; ela é enviada ao nosso servidor para desenhar o mapa e não é guardada entre o check-in e o check-out. O app não acompanha sua localização com essa tela fechada e, no computador, não pede localização." },
        { lead: "Conteúdo da visita", text: "As notas de voz que você grava (guardamos o áudio), a transcrição e o resumo feito pela IA, as fotos que você adiciona, o desfecho da visita e suas anotações." },
        { lead: "Dados de negócio que você cadastra", text: "Empresas e endereços, pessoas dessas empresas (nome, cargo, telefone, e-mail), produtos, vendas, estoque deixado em consignação, oportunidades e tarefas." },
        { lead: "Leituras de QR e NFC", text: "Quando alguém escaneia uma peça Xpot, não guardamos o endereço IP. Guardamos o horário, o tipo de aparelho, a família do sistema e do navegador, o domínio do site de origem, se parece um robô e uma chave anônima que muda todo dia, usada só para contar visitantes únicos. Podemos guardar o país." },
        { lead: "Dados técnicos", text: "Um cookie de sessão que mantém você conectado por 30 dias e se renova enquanto você usa o app, e preferências salvas no navegador (idioma, último módulo usado, peças abertas recentemente). Não usamos rastreadores de publicidade nem de análise." },
      ],
    },
    {
      heading: "3. Como usamos",
      body: [
        {
          list: [
            "Para fazer o app funcionar: check-ins, mapas, clientes, vendas, estoque e peças.",
            "Para confirmar que as visitas aconteceram mesmo no local do cliente.",
            "Para transcrever e resumir as notas de voz e sugerir ações, que você confirma antes de qualquer registro.",
            "Para enviar dados ao CRM que sua equipe conectar (por exemplo, Xphere ou GoHighLevel).",
            "Para enviar códigos de acesso e avisar nossa equipe sobre novos cadastros.",
            "Para mostrar a gestores e administradores a atividade da equipe deles.",
            "Para manter o serviço seguro e evitar abusos.",
          ],
        },
        "Não vendemos dados pessoais e não os usamos para publicidade.",
      ],
    },
    {
      heading: "4. Prestadores de serviço",
      body: [
        "Usamos estes prestadores para operar o Xpot. Eles tratam os dados só para nos prestar o serviço deles:",
        {
          list: [
            "Hetzner, via Coolify: hospedagem e banco de dados.",
            "Supabase: login e armazenamento de arquivos (fotos, fotos de perfil, notas de voz).",
            "Twilio: SMS com os códigos de acesso.",
            "Groq e OpenAI: transcrição das notas de voz (recebem o áudio).",
            "OpenRouter e Google Gemini: resumos e ações sugeridas (recebem a transcrição, o nome da empresa e sua lista de produtos).",
            "Google Maps Platform: busca de lugares e mapas (recebe o texto buscado e as coordenadas).",
            "Xphere e GoHighLevel: sincronização com o CRM, quando sua equipe os conecta.",
            "Loja Stuscle: verificação dos códigos de atacado.",
          ],
        },
        "Alguns desses prestadores ficam nos Estados Unidos ou em outros países, então seus dados podem ser tratados fora do país onde você mora.",
      ],
    },
    {
      heading: "5. Quem vê seus dados",
      body: [
        "Gestores e administradores da sua equipe veem as visitas, vendas e clientes dos vendedores que eles gerenciam. A equipe da Skale Club pode acessar os dados para dar suporte e operar o serviço. Os CRMs que sua equipe conectar recebem o que for sincronizado com eles.",
      ],
    },
    {
      heading: "6. Arquivos e links",
      body: [
        "Fotos, fotos de perfil e notas de voz ficam guardadas com links longos, impossíveis de adivinhar. Quem tiver um desses links consegue abrir o arquivo, então não os compartilhe fora da sua equipe.",
      ],
    },
    {
      heading: "7. Por quanto tempo guardamos",
      body: [
        "Guardamos seus dados enquanto sua conta estiver ativa e pelo tempo necessário para a relação comercial. Os códigos de acesso são apagados depois do uso e as sessões expiram após 30 dias sem uso. Apagar uma empresa ou uma visita no app a remove do app; para apagar os arquivos guardados ou sua conta inteira, fale conosco e nós fazemos isso.",
      ],
    },
    {
      heading: "8. Seus direitos",
      body: [
        "Dependendo de onde você mora (por exemplo, pela LGPD no Brasil, pelo GDPR na Europa ou pelo CCPA na Califórnia), você pode pedir para acessar, corrigir, exportar ou apagar seus dados, ou se opor a algum uso. As pessoas das empresas cadastradas no Xpot podem fazer os mesmos pedidos. Fale conosco e respondemos em até 30 dias.",
      ],
    },
    {
      heading: "9. Segurança",
      body: [
        "O tráfego é criptografado (HTTPS), os códigos de acesso e os tokens ficam guardados como hash, o cookie de sessão não pode ser lido por scripts e o que cada pessoa vê depende do papel dela. Nenhum sistema é totalmente seguro: se notar algo estranho, avise-nos na hora.",
      ],
    },
    {
      heading: "10. Menores de idade",
      body: ["O Xpot é uma ferramenta para empresas e não se destina a menores de 18 anos."],
    },
    {
      heading: "11. Mudanças",
      body: [
        "Quando mudarmos esta política, atualizamos a data no topo. Se a mudança for importante, também avisamos no app.",
      ],
    },
  ],
};

const privacyEs: LegalDoc = {
  title: "Política de Privacidad",
  updated: "Actualizada el 4 de octubre de 2026",
  intro:
    "Xpot (xpot.place) es una app de ventas en la calle operada por Skale Club (“nosotros”). Esta política explica qué recopilamos de quienes usan la app (vendedores, gerentes y administradores), qué guardamos sobre las empresas y los contactos registrados en ella y qué registramos cuando alguien escanea una pieza QR o NFC de Xpot.",
  sections: [
    {
      heading: "1. Quién es el responsable",
      body: [
        "Skale Club opera Xpot y decide cómo se usan los datos descritos aquí. Si usas Xpot para una empresa que trabaja con nosotros, esa empresa también decide cómo se usan los datos de sus clientes. Puedes escribirnos por el contacto al final de esta página.",
      ],
    },
    {
      heading: "2. Qué recopilamos",
      body: [
        { lead: "Cuenta", text: "Tu número de teléfono, tu nombre y, si los das, tu correo y tu foto de perfil. Para entrar te enviamos un código de 6 dígitos por SMS; solo guardamos un hash del código, que vence a los 10 minutos. Si entras con Google, recibimos de Google tu nombre y tu correo." },
        { lead: "Ubicación", text: "En el check-in y el check-out registramos tu posición GPS, su precisión y la distancia a la empresa. Con la pantalla de Check-in abierta, la app sigue tu posición para validar la visita y dibujar el mapa; se envía a nuestro servidor para dibujar el mapa y no se guarda entre el check-in y el check-out. La app no sigue tu ubicación con esa pantalla cerrada y, en una computadora, no pide la ubicación." },
        { lead: "Contenido de la visita", text: "Las notas de voz que grabas (guardamos el audio), su transcripción y el resumen de la IA, las fotos que agregas, el resultado de la visita y tus notas." },
        { lead: "Datos de negocio que registras", text: "Empresas y sus direcciones, personas de esas empresas (nombre, cargo, teléfono, correo), productos, ventas, stock dejado en consignación, oportunidades y tareas." },
        { lead: "Lecturas de QR y NFC", text: "Cuando alguien escanea una pieza Xpot no guardamos su dirección IP. Guardamos la hora, el tipo de dispositivo, la familia del sistema operativo y del navegador, el dominio del sitio de origen, si parece un robot y una clave anónima que cambia cada día, usada solo para contar visitantes únicos. Podemos guardar el país." },
        { lead: "Datos técnicos", text: "Una cookie de sesión que te mantiene conectado 30 días y se renueva mientras usas la app, y preferencias guardadas en tu navegador (idioma, último módulo usado, piezas abiertas recientemente). No usamos rastreadores de publicidad ni de analítica." },
      ],
    },
    {
      heading: "3. Cómo lo usamos",
      body: [
        {
          list: [
            "Para que la app funcione: check-ins, mapas, clientes, ventas, stock y piezas.",
            "Para confirmar que las visitas ocurrieron de verdad en el lugar del cliente.",
            "Para transcribir y resumir las notas de voz y sugerir acciones, que confirmas antes de que se registre nada.",
            "Para enviar datos al CRM que conecte tu equipo (por ejemplo, Xphere o GoHighLevel).",
            "Para enviar códigos de acceso y avisar a nuestro equipo de los nuevos registros.",
            "Para mostrar a gerentes y administradores la actividad de su equipo.",
            "Para mantener el servicio seguro y evitar abusos.",
          ],
        },
        "No vendemos datos personales ni los usamos para publicidad.",
      ],
    },
    {
      heading: "4. Proveedores de servicios",
      body: [
        "Usamos estos proveedores para operar Xpot. Tratan los datos solo para prestarnos su servicio:",
        {
          list: [
            "Hetzner, a través de Coolify: alojamiento y base de datos.",
            "Supabase: inicio de sesión y almacenamiento de archivos (fotos, fotos de perfil, notas de voz).",
            "Twilio: mensajes SMS con los códigos de acceso.",
            "Groq y OpenAI: transcripción de las notas de voz (reciben el audio).",
            "OpenRouter y Google Gemini: resúmenes y acciones sugeridas (reciben la transcripción, el nombre de la empresa y tu lista de productos).",
            "Google Maps Platform: búsqueda de lugares y mapas (recibe el texto buscado y las coordenadas).",
            "Xphere y GoHighLevel: sincronización con el CRM, cuando tu equipo los conecta.",
            "Tienda Stuscle: verificación de los códigos mayoristas.",
          ],
        },
        "Algunos de estos proveedores están en Estados Unidos o en otros países, así que tus datos pueden tratarse fuera del país donde vives.",
      ],
    },
    {
      heading: "5. Quién ve tus datos",
      body: [
        "Los gerentes y administradores de tu equipo ven las visitas, ventas y clientes de los vendedores que gestionan. El personal de Skale Club puede acceder a los datos para dar soporte y operar el servicio. Los CRM que conecte tu equipo reciben lo que se sincroniza con ellos.",
      ],
    },
    {
      heading: "6. Archivos y enlaces",
      body: [
        "Las fotos, las fotos de perfil y las notas de voz se guardan con enlaces largos que no se pueden adivinar. Quien tenga uno de esos enlaces puede abrir el archivo, así que no los compartas fuera de tu equipo.",
      ],
    },
    {
      heading: "7. Cuánto tiempo lo guardamos",
      body: [
        "Guardamos tus datos mientras tu cuenta esté activa y el tiempo necesario para la relación comercial. Los códigos de acceso se borran después de usarse y las sesiones vencen tras 30 días sin uso. Borrar una empresa o una visita en la app la quita de la app; para borrar los archivos guardados o tu cuenta completa, escríbenos y lo hacemos.",
      ],
    },
    {
      heading: "8. Tus derechos",
      body: [
        "Según donde vivas (por ejemplo, la LGPD en Brasil, el RGPD en Europa o la CCPA en California), puedes pedir acceder, corregir, exportar o borrar tus datos, u oponerte a algún uso. Las personas de las empresas registradas en Xpot pueden hacer las mismas solicitudes. Escríbenos y respondemos en un plazo de 30 días.",
      ],
    },
    {
      heading: "9. Seguridad",
      body: [
        "El tráfico va cifrado (HTTPS), los códigos de acceso y los tokens se guardan como hash, los scripts no pueden leer la cookie de sesión y lo que ve cada persona depende de su rol. Ningún sistema es totalmente seguro: si notas algo raro, avísanos enseguida.",
      ],
    },
    {
      heading: "10. Menores de edad",
      body: ["Xpot es una herramienta para empresas y no está dirigida a menores de 18 años."],
    },
    {
      heading: "11. Cambios",
      body: [
        "Cuando cambiemos esta política actualizaremos la fecha de arriba. Si el cambio es importante, también te avisaremos en la app.",
      ],
    },
  ],
};

const termsEn: LegalDoc = {
  title: "Terms of Service",
  updated: "Last updated: October 4, 2026",
  intro:
    "These terms govern your use of Xpot (xpot.place), a field sales app operated by Skale Club (“we”, “us”). By creating an account or using Xpot you agree to them. If you use Xpot on behalf of a company, you confirm that you can accept these terms for it.",
  sections: [
    {
      heading: "1. The service",
      body: [
        "Xpot helps sales teams record visits with GPS check-ins, turn voice notes into summaries and suggested actions, record sales and stock left on consignment, manage QR and NFC pieces, and sync this data with a CRM. We may improve, change or remove features over time.",
      ],
    },
    {
      heading: "2. Accounts",
      body: [
        "You sign up with your phone number. New accounts are reviewed and switched on by Skale Club, and we may refuse, suspend or block an account. Keep your phone and your sign-in codes to yourself: you are responsible for what is done with your account. Managers and admins are responsible for the people they give access to.",
      ],
    },
    {
      heading: "3. Acceptable use",
      body: [
        "You agree not to:",
        {
          list: [
            "Fake check-ins or try to trick the location checks.",
            "Record anyone without the consent the law requires. Voice notes are meant for your own notes after the visit.",
            "Enter data you have no right to use, or use contacts recorded in Xpot for spam.",
            "Point QR or NFC pieces to illegal, misleading or harmful content.",
            "Copy, reverse engineer or disrupt the service, or access data that is not yours.",
            "Break any law while using Xpot.",
          ],
        },
      ],
    },
    {
      heading: "4. Your data",
      body: [
        "The data you and your team enter remains yours. You allow us to host, process and send it to the services you connect only to provide Xpot, as described in our Privacy Policy. You are responsible for having the right to record the businesses and contacts you add.",
      ],
    },
    {
      heading: "5. AI features",
      body: [
        "Transcripts, summaries and suggested actions are produced automatically and can be wrong. Nothing suggested is recorded until you confirm it, so check it first. You remain responsible for the records you confirm.",
      ],
    },
    {
      heading: "6. QR/NFC pieces and the wholesale store",
      body: [
        "Pieces are supplied by Skale Club or its partners. Purchases in the wholesale store follow that store’s own terms. You are responsible for the link each piece points to, and we may switch off a piece that points to harmful content.",
      ],
    },
    {
      heading: "7. Third-party services",
      body: [
        "Xpot works with services run by others, such as CRMs and Google Maps. Their own terms apply to them, and we are not responsible for how they work.",
      ],
    },
    {
      heading: "8. Fees",
      body: [
        "Any fees for Xpot are agreed separately with Skale Club. The app itself does not process payments: it only records the sales you make.",
      ],
    },
    {
      heading: "9. Availability",
      body: [
        "We work to keep Xpot available, but it is provided “as is” and may have interruptions, errors or maintenance. Some features, such as check-in, need an internet connection.",
      ],
    },
    {
      heading: "10. Intellectual property",
      body: [
        "The Xpot software, name and brand belong to Skale Club. These terms do not give you any right to them beyond using the service.",
      ],
    },
    {
      heading: "11. Liability",
      body: [
        "To the extent the law allows, Skale Club is not liable for indirect or consequential damages, such as lost sales, lost profits or lost data. Our total liability for any claim is limited to the amount you paid us for Xpot in the 12 months before the claim, or USD 100 if you paid nothing. Nothing in these terms limits rights that the law does not allow to be limited.",
      ],
    },
    {
      heading: "12. Ending your use",
      body: [
        "You can stop using Xpot at any time and ask us to delete your account. We may suspend or end your access if you break these terms or to protect the service or other users. The sections on data, liability and law continue to apply after that.",
      ],
    },
    {
      heading: "13. Changes to these terms",
      body: [
        "When we change these terms we update the date at the top, and we tell you in the app if the change is significant. If you keep using Xpot after a change, you accept the new terms.",
      ],
    },
    {
      heading: "14. Law and disputes",
      body: [
        "These terms are governed by the laws of the place where Skale Club is established. Before going to court, we will both try in good faith to solve any disagreement by talking to each other. Consumer protections that the law does not allow to be waived still apply.",
      ],
    },
  ],
};

const termsPt: LegalDoc = {
  title: "Termos de Uso",
  updated: "Atualizados em 4 de outubro de 2026",
  intro:
    "Estes termos regem o uso do Xpot (xpot.place), um app de vendas externas operado pela Skale Club (“nós”). Ao criar uma conta ou usar o Xpot, você concorda com eles. Se você usa o Xpot em nome de uma empresa, confirma que pode aceitar estes termos por ela.",
  sections: [
    {
      heading: "1. O serviço",
      body: [
        "O Xpot ajuda equipes de venda a registrar visitas com check-in por GPS, transformar notas de voz em resumos e ações sugeridas, registrar vendas e estoque deixado em consignação, gerenciar peças QR e NFC e sincronizar esses dados com um CRM. Podemos melhorar, mudar ou remover funções com o tempo.",
      ],
    },
    {
      heading: "2. Contas",
      body: [
        "Você se cadastra com seu número de celular. Novas contas são revisadas e liberadas pela Skale Club, e podemos recusar, suspender ou bloquear uma conta. Não compartilhe seu celular nem seus códigos de acesso: você responde pelo que for feito com sua conta. Gestores e administradores respondem pelas pessoas a quem dão acesso.",
      ],
    },
    {
      heading: "3. Uso permitido",
      body: [
        "Você concorda em não:",
        {
          list: [
            "Fingir check-ins ou tentar enganar a verificação de localização.",
            "Gravar alguém sem o consentimento que a lei exige. As notas de voz são para as suas próprias anotações depois da visita.",
            "Cadastrar dados que você não tem direito de usar, nem usar os contatos do Xpot para spam.",
            "Apontar peças QR ou NFC para conteúdo ilegal, enganoso ou prejudicial.",
            "Copiar, fazer engenharia reversa ou atrapalhar o serviço, nem acessar dados que não são seus.",
            "Descumprir qualquer lei ao usar o Xpot.",
          ],
        },
      ],
    },
    {
      heading: "4. Seus dados",
      body: [
        "Os dados que você e sua equipe cadastram continuam sendo de vocês. Você nos autoriza a hospedá-los, tratá-los e enviá-los aos serviços que vocês conectarem apenas para prestar o Xpot, como descrito na nossa Política de Privacidade. Você é responsável por ter o direito de cadastrar as empresas e os contatos que adicionar.",
      ],
    },
    {
      heading: "5. Funções de IA",
      body: [
        "Transcrições, resumos e ações sugeridas são gerados automaticamente e podem conter erros. Nada do que é sugerido fica registrado antes de você confirmar, então confira antes. Você continua responsável pelos registros que confirmar.",
      ],
    },
    {
      heading: "6. Peças QR/NFC e a loja de atacado",
      body: [
        "As peças são fornecidas pela Skale Club ou por parceiros. Compras na loja de atacado seguem os termos dessa loja. Você é responsável pelo link de cada peça, e podemos desativar uma peça que aponte para conteúdo prejudicial.",
      ],
    },
    {
      heading: "7. Serviços de terceiros",
      body: [
        "O Xpot funciona com serviços de outras empresas, como CRMs e o Google Maps. Os termos deles se aplicam a eles, e não respondemos pelo funcionamento deles.",
      ],
    },
    {
      heading: "8. Valores",
      body: [
        "Qualquer valor cobrado pelo Xpot é combinado à parte com a Skale Club. O app não processa pagamentos: ele só registra as vendas que você faz.",
      ],
    },
    {
      heading: "9. Disponibilidade",
      body: [
        "Trabalhamos para manter o Xpot no ar, mas ele é oferecido “no estado em que se encontra” e pode ter interrupções, erros ou manutenções. Algumas funções, como o check-in, precisam de internet.",
      ],
    },
    {
      heading: "10. Propriedade intelectual",
      body: [
        "O software, o nome e a marca Xpot pertencem à Skale Club. Estes termos não dão a você nenhum direito sobre eles além do uso do serviço.",
      ],
    },
    {
      heading: "11. Responsabilidade",
      body: [
        "Na medida em que a lei permitir, a Skale Club não responde por danos indiretos, como vendas, lucros ou dados perdidos. Nossa responsabilidade total por qualquer reclamação fica limitada ao valor que você nos pagou pelo Xpot nos 12 meses anteriores, ou a USD 100 se você não pagou nada. Nada nestes termos limita direitos que a lei não permite limitar.",
      ],
    },
    {
      heading: "12. Encerramento",
      body: [
        "Você pode parar de usar o Xpot quando quiser e pedir que apaguemos sua conta. Podemos suspender ou encerrar seu acesso se você descumprir estes termos ou para proteger o serviço e os outros usuários. As cláusulas sobre dados, responsabilidade e lei continuam valendo depois disso.",
      ],
    },
    {
      heading: "13. Mudanças nestes termos",
      body: [
        "Quando mudarmos estes termos, atualizamos a data no topo e avisamos no app se a mudança for importante. Se você continuar usando o Xpot depois da mudança, aceita os novos termos.",
      ],
    },
    {
      heading: "14. Lei e conflitos",
      body: [
        "Estes termos seguem as leis do lugar onde a Skale Club está estabelecida. Antes de ir à Justiça, as duas partes vão tentar resolver qualquer desacordo conversando, de boa-fé. Os direitos do consumidor que a lei não permite renunciar continuam valendo.",
      ],
    },
  ],
};

const termsEs: LegalDoc = {
  title: "Términos del Servicio",
  updated: "Actualizados el 4 de octubre de 2026",
  intro:
    "Estos términos rigen el uso de Xpot (xpot.place), una app de ventas en la calle operada por Skale Club (“nosotros”). Al crear una cuenta o usar Xpot los aceptas. Si usas Xpot en nombre de una empresa, confirmas que puedes aceptar estos términos por ella.",
  sections: [
    {
      heading: "1. El servicio",
      body: [
        "Xpot ayuda a los equipos de venta a registrar visitas con check-in por GPS, convertir notas de voz en resúmenes y acciones sugeridas, registrar ventas y stock dejado en consignación, gestionar piezas QR y NFC y sincronizar estos datos con un CRM. Podemos mejorar, cambiar o quitar funciones con el tiempo.",
      ],
    },
    {
      heading: "2. Cuentas",
      body: [
        "Te registras con tu número de teléfono. Skale Club revisa y activa las cuentas nuevas, y podemos rechazar, suspender o bloquear una cuenta. No compartas tu teléfono ni tus códigos de acceso: eres responsable de lo que se haga con tu cuenta. Los gerentes y administradores responden por las personas a las que dan acceso.",
      ],
    },
    {
      heading: "3. Uso aceptable",
      body: [
        "Te comprometes a no:",
        {
          list: [
            "Fingir check-ins ni intentar engañar la verificación de ubicación.",
            "Grabar a nadie sin el consentimiento que exige la ley. Las notas de voz son para tus propias notas después de la visita.",
            "Registrar datos que no tienes derecho a usar, ni usar los contactos de Xpot para spam.",
            "Apuntar piezas QR o NFC a contenido ilegal, engañoso o dañino.",
            "Copiar, hacer ingeniería inversa o perturbar el servicio, ni acceder a datos que no son tuyos.",
            "Incumplir cualquier ley al usar Xpot.",
          ],
        },
      ],
    },
    {
      heading: "4. Tus datos",
      body: [
        "Los datos que tú y tu equipo registran siguen siendo suyos. Nos autorizas a alojarlos, tratarlos y enviarlos a los servicios que conecten solo para prestar Xpot, como se describe en nuestra Política de Privacidad. Eres responsable de tener derecho a registrar las empresas y los contactos que agregas.",
      ],
    },
    {
      heading: "5. Funciones de IA",
      body: [
        "Las transcripciones, los resúmenes y las acciones sugeridas se generan automáticamente y pueden tener errores. Nada de lo sugerido se registra hasta que lo confirmas, así que revísalo antes. Sigues siendo responsable de los registros que confirmas.",
      ],
    },
    {
      heading: "6. Piezas QR/NFC y la tienda mayorista",
      body: [
        "Las piezas las suministra Skale Club o sus socios. Las compras en la tienda mayorista siguen los términos de esa tienda. Eres responsable del enlace de cada pieza, y podemos desactivar una pieza que apunte a contenido dañino.",
      ],
    },
    {
      heading: "7. Servicios de terceros",
      body: [
        "Xpot funciona con servicios de otras empresas, como CRM y Google Maps. Sus propios términos se aplican a ellos y no respondemos por cómo funcionan.",
      ],
    },
    {
      heading: "8. Tarifas",
      body: [
        "Cualquier tarifa por Xpot se acuerda por separado con Skale Club. La app no procesa pagos: solo registra las ventas que haces.",
      ],
    },
    {
      heading: "9. Disponibilidad",
      body: [
        "Trabajamos para mantener Xpot disponible, pero se ofrece “tal cual” y puede tener interrupciones, errores o mantenimiento. Algunas funciones, como el check-in, necesitan conexión a internet.",
      ],
    },
    {
      heading: "10. Propiedad intelectual",
      body: [
        "El software, el nombre y la marca Xpot pertenecen a Skale Club. Estos términos no te dan ningún derecho sobre ellos más allá de usar el servicio.",
      ],
    },
    {
      heading: "11. Responsabilidad",
      body: [
        "En la medida en que la ley lo permita, Skale Club no responde por daños indirectos, como ventas, ganancias o datos perdidos. Nuestra responsabilidad total por cualquier reclamo se limita a lo que nos pagaste por Xpot en los 12 meses anteriores, o a USD 100 si no pagaste nada. Nada en estos términos limita derechos que la ley no permite limitar.",
      ],
    },
    {
      heading: "12. Fin del uso",
      body: [
        "Puedes dejar de usar Xpot cuando quieras y pedirnos que borremos tu cuenta. Podemos suspender o terminar tu acceso si incumples estos términos o para proteger el servicio y a otros usuarios. Las cláusulas sobre datos, responsabilidad y ley siguen vigentes después.",
      ],
    },
    {
      heading: "13. Cambios en estos términos",
      body: [
        "Cuando cambiemos estos términos actualizaremos la fecha de arriba y te avisaremos en la app si el cambio es importante. Si sigues usando Xpot después del cambio, aceptas los nuevos términos.",
      ],
    },
    {
      heading: "14. Ley y conflictos",
      body: [
        "Estos términos se rigen por las leyes del lugar donde Skale Club está establecida. Antes de acudir a los tribunales, ambas partes intentaremos resolver cualquier desacuerdo conversando de buena fe. Siguen vigentes las protecciones al consumidor que la ley no permite renunciar.",
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<"privacy" | "terms", Record<Lang, LegalDoc>> = {
  privacy: { en: privacyEn, pt: privacyPt, es: privacyEs },
  terms: { en: termsEn, pt: termsPt, es: termsEs },
};
