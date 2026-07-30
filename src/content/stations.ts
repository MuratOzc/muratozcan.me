import { L, type Localized } from './i18n';

/**
 * The stations along the path.
 *
 * Positions are DERIVED, not written down. Give the list an order and it
 * spreads evenly between FIRST_AT and LAST_AT, alternating sides. Add or
 * remove a station and everything respaces itself — which matters, because
 * the running order has already changed three times.
 *
 * The arch stands at 5 and the figure at 54.8, so the run from 9 to 50.8
 * leaves a beat at each end.
 *
 * The through-line: station one asks what to call someone who runs an entire
 * technology organisation alone, the stations in between ARE the org chart,
 * and the contact station closes the loop — "if you worked out the title,
 * that's the subject line."
 */

/** Distance along the path, in units, of the first and last stations. */
const FIRST_AT = 9.0;
const LAST_AT = 50.8;
/** How far off the path centre line the stations sit. */
const LATERAL = 3;

export interface Station {
  n: number;
  id: string;
  title: Localized;
  /** Distance along the path from spawn, in units. Derived. */
  at: number;
  /** Perpendicular offset. Negative is left of the path. Derived. */
  lateral: number;
  /** The exhibit, named on the sign's small print. */
  object: Localized;
  body: Localized;
}

type StationDef = Pick<Station, 'id' | 'title' | 'object' | 'body'>;

const DEFS: StationDef[] = [
  {
    id: 'title',
    title: L('The title problem', 'Unvan problemi'),
    object: L(
      'signpost, every title crossed out, one blank',
      'tabela direği, tüm unvanlar çizili, biri boş',
    ),
    body: L(
      'I run the technology side of an early-stage startup — strategy, architecture, backend, frontend, databases, servers, networking, security, deployments. Every plate on this post is technically correct. None of them is the whole job. The rest of this path is the actual job description.',
      'Erken aşama bir startup’ın teknoloji tarafını ben yürütüyorum — strateji, mimari, backend, frontend, veritabanları, sunucular, ağ, güvenlik, dağıtımlar. Bu direkteki her levha teknik olarak doğru; ama hiçbiri işin tamamı değil. Asıl iş tanımı, bu yolun geri kalanı.',
    ),
  },
  {
    id: 'origin',
    title: L('Maths and computers', 'Matematik ve bilgisayar'),
    object: L('school desk, chalkboard, a CRT', 'okul sırası, kara tahta, tüplü ekran'),
    body: L(
      'Good at maths, good at computers — software and hardware — for as long as I can remember. Mathematical engineering was the obvious move: Yıldız Technical University, 2018–2024. The formula on the board is not decoration; it is the exact equation that places every object in this world. Including the board.',
      'Kendimi bildim bileli matematiğim ve bilgisayarım iyiydi — yazılımıyla da donanımıyla da. Matematik mühendisliği bu yüzden bariz tercihti: Yıldız Teknik Üniversitesi, 2018–2024. Tahtadaki formül süs değil; bu dünyadaki her nesneyi yerine koyan denklemin ta kendisi. Tahta dahil.',
    ),
  },
  {
    id: 'architecture',
    title: L('Architecture', 'Mimari'),
    object: L('scale model of this world', 'bu dünyanın maketi'),
    body: L(
      'Deciding the shape of a system before it sets, then living with the decision. I design ours end to end — the services, the data, the seams between them. The honest architecture diagram is a world you have to walk through: everything connected, nothing hidden, and the person who drew it lives in it.',
      'Bir sistemin şeklini katılaşmadan önce belirlemek, sonra o kararla yaşamak. Bizimkini uçtan uca ben tasarlıyorum — servisler, veri, aralarındaki dikişler. Dürüst mimari diyagram, içinde yürümek zorunda olduğunuz bir dünyadır: her şey bağlı, hiçbir şey gizli değil ve çizen kişi içinde yaşıyor.',
    ),
  },
  {
    id: 'backend',
    title: L('Backend', 'Backend'),
    object: L(
      'a cased movement, thirty gears, one input',
      'kasalı bir mekanizma, otuz dişli, tek giriş',
    ),
    body: L(
      'C# and .NET — Framework and modern, Razor, Blazor, MVC, minimal APIs, with detours through React and Node. The application is the part nobody applauds: requests in, correct answers out, every time, for years. That is the whole trick, and it is harder than it sounds.',
      'C# ve .NET — Framework’ü de moderni de; Razor, Blazor, MVC, minimal API’ler; arada React ve Node gezintileri. Uygulama, kimsenin alkışlamadığı kısımdır: istek girer, doğru cevap çıkar; her seferinde, yıllarca. Bütün numara bu — ve kulağa geldiğinden zor.',
    ),
  },
  {
    id: 'frontend',
    title: L('Frontend', 'Frontend'),
    object: L('a monitor showing this site', 'bu siteyi gösteren bir ekran'),
    body: L(
      'The only layer anyone ever sees, so it carries the whole first impression. At work that means Razor and Blazor interfaces people use all day. Here it means the thing you are standing in: a hand-built WebGL world on a curved space. A CV should show, not tell.',
      'Herkesin gördüğü tek katman; ilk izlenimin tamamını o taşır. İşte bu, insanların bütün gün kullandığı Razor ve Blazor arayüzleri demek. Burada ise içinde durduğunuz şey demek: kavisli bir uzayda elle yazılmış bir WebGL dünyası. Bir CV anlatmamalı, göstermeli.',
    ),
  },
  {
    id: 'data',
    title: L('Data', 'Veri'),
    object: L('filing cabinets, arranged like an index', 'dosya dolapları, dizin gibi dizili'),
    body: L(
      'SQL Server: schema design, query tuning, indexes, backups, and the quiet maintenance underneath all of it. Code gets rewritten; data is forever. I treat the database like the part we will still have in ten years — because it is.',
      'SQL Server: şema tasarımı, sorgu iyileştirme, indeksler, yedekler ve hepsinin altındaki sessiz bakım. Kod yeniden yazılır; veri kalıcıdır. Veritabanına, on yıl sonra da elimizde olacak parça gibi davranırım — çünkü öyle.',
    ),
  },
  {
    id: 'infrastructure',
    title: L('Infrastructure', 'Altyapı'),
    object: L(
      'an open rack: two Windows, one penguin, cables into the earth',
      'açık kabin: iki Windows, bir penguen, toprağa inen kablolar',
    ),
    body: L(
      'Three dedicated machines — two Windows, one Linux. Web server, backups, monitoring: set up by me, run by me. No cloud between me and the metal. When something breaks at 3 a.m., the person it wakes is also the person who can fix it.',
      'Üç fiziksel sunucu — ikisi Windows, biri Linux. Web sunucusu, yedekler, izleme: hepsini ben kurdum, ben işletiyorum. Metalle aramda bulut yok. Gece üçte bir şey bozulursa, uyandırdığı kişiyle tamir edebilen kişi aynı.',
    ),
  },
  {
    id: 'security',
    title: L('Security', 'Güvenlik'),
    object: L(
      'camera mast, barbed wire, a safe labelled .env',
      'kamera direği, dikenli tel, üzerinde .env yazan kasa',
    ),
    body: L(
      'Secure code, correct permissions, certificates that never lapse, logs that actually get read — and secrets that stay in the safe. Security is mostly refusing to do the stupid thing, daily, forever. Done right, it looks like nothing happening. The cameras, by the way, have been with you since the arch.',
      'Güvenli kod, doğru yetkiler, süresi geçmeyen sertifikalar, gerçekten okunan loglar — ve kasada kalan sırlar. Güvenlik çoğunlukla aptalca şeyi yapmayı reddetmektir; her gün, sonsuza dek. Doğru yapılınca hiçbir şey olmuyormuş gibi görünür. Bu arada kameralar, kemerin altından geçtiğinizden beri sizinle.',
    ),
  },
  {
    id: 'shipping',
    title: L('Shipping', 'Sevkiyat'),
    object: L('conveyor: build, test, prod', 'konveyör: build, test, prod'),
    body: L(
      'CI/CD, deployment automation, releases. The pipeline exists so that shipping is boring: build, test, out the door — no ceremony, no heroics. Exciting deployments are how you learn the value of boring ones. I did that learning so it stays boring.',
      'CI/CD, dağıtım otomasyonu, sürümler. Pipeline, yayına almak sıkıcı olsun diye var: derle, test et, kapıdan çıkar — tören yok, kahramanlık yok. Heyecanlı dağıtımlar, sıkıcılarının kıymetini öğretir. O dersi ben aldım ki sıkıcı kalsın.',
    ),
  },
  {
    id: 'contact',
    title: L('Contact', 'İletişim'),
    object: L('mailbox and a signpost with links', 'posta kutusu ve bağlantı tabelası'),
    body: L(
      'mr.muratozcan@gmail.com — or take a link from the signpost. And if somewhere on this walk you worked out what my title should be, that is the subject line I want.\nhttps://www.linkedin.com/in/muratozc/\nhttps://github.com/MuratOzc/\nhttps://www.instagram.com/murtileyto/',
      'mr.muratozcan@gmail.com — ya da tabeladan bir bağlantı seçin. Ve bu yürüyüşte unvanımın ne olması gerektiğini çözdüyseniz, e-postanın konusu hazır demektir.\nhttps://www.linkedin.com/in/muratozc/\nhttps://github.com/MuratOzc/\nhttps://www.instagram.com/murtileyto/',
    ),
  },
];

export const STATIONS: Station[] = DEFS.map((d, i) => ({
  ...d,
  n: i + 1,
  at:
    DEFS.length === 1
      ? FIRST_AT
      : FIRST_AT + (LAST_AT - FIRST_AT) * (i / (DEFS.length - 1)),
  lateral: i % 2 === 0 ? -LATERAL : LATERAL,
}));

/** Gap between consecutive stations, in units. Useful for sanity checks. */
export const STATION_SPACING =
  DEFS.length > 1 ? (LAST_AT - FIRST_AT) / (DEFS.length - 1) : 0;
