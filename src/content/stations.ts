import { L, type Localized } from './i18n';
import { isTouch } from '../device';

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
 * The through-line: station one says there is no job title, the stations in
 * between are what the job actually is, and the contact station closes the
 * loop — "maybe we work out the title together."
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
  /** The line of small print under the title on the sign. */
  object: Localized;
  body: Localized;
}

type StationDef = Pick<Station, 'id' | 'title' | 'object' | 'body'>;

const DEFS: StationDef[] = [
  {
    id: 'title',
    title: L('I don’t have a job title', 'İş ünvanım yok'),
    object: L(
      'I don’t know what I am either',
      'Ne olduğumu ben de bilmiyorum',
    ),
    body: L(
      'Architectural decisions, backend, frontend, databases and SQL, AI, security, git, servers, hardware... And not in a jack-of-all-trades way either — I am properly deep in all of it. Which is why my real job title is this website itself.',
      'Mimari kararlar, backend, frontend, veritabanları ve sql, yapay zeka, güvenlik, git, sunucular, donanım... Ne iş olsa yaparım elemanları gibi de değil, oldukça içli dışlıyım. Bu yüzden asıl iş ünvanım bu sitenin ta kendisi.',
    ),
  },
  {
    id: 'origin',
    title: L('Maths and Technology', 'Matematik ve Teknoloji'),
    object: L('Ever since I was in diapers', 'Biz bu işe beşikte başladık'),
    body: L(
      'For as long as I can remember, maths and technology and I got along. My interst for both started before primary school. So when it came to picking a university course, mathematical engineering was the obvious road. Yıldız Technical University, 2018–2024.',
      'Kendimi bildim bileli matematik ve teknolojiyle aram çok iyiydi. İkisini de ilkokuldan önce kurcalamaya başladım. Dolayısıyla üniversite tercihlerinde matematik mühendisliği benim için bariz yoldu. Yıldız Teknik Üniversitesi 2018-2024',
    ),
  },
  {
    id: 'architecture',
    title: L('Architecture', 'Mimari'),
    object: L('Not just a job for architects', 'Sadece mimarların işi değil'),
    body: L(
      'I never start anything without a detailed plan. I cover my bases, think it through from every angle, and only then set off. Software is no different. Designing every part of a system so that it is both solid and open to improvement is what gets you somewhere in this world.',
      'Hiçbir işe detaylı plan yapmadan başlamam. İşimi garantiye alır, enine boyuna düşünür öyle yola çıkarım. Yazılımda da öyle. Sistemin tüm parçalarını tasarlayıp hem sağlam hem de geliştirmeye açık olmasını sağlamak bu dünyada sizi ileri götürür.',
    ),
  },
  {
    id: 'backend',
    title: L('Backend', 'Backend'),
    object: L(
      'Why not call it the rear end, then?',
      'Niye gerison değil mesela?',
    ),
    body: L(
      'I like C# and .NET. Love them, actually. I have messed around with TypeScript too, but JavaScript — may God spare my worst enemy’s IDE from it. How is one language that awful? Anyway: modern .NET, .NET Framework, Razor, Blazor, MVC, minimal APIs, I have tried all of them. After minimal APIs I cannot even look at MVC.',
      'C# ve .NET’i seviyorum. Hatta bayılıyorum. Typescript ile falan da uğraştım da javascript’i Allah düşmanımın IDE’sine vermesin, bu kadar rezil bir dil olabilir mi ya? Neyse, Modern .NET, .NET Framework, Razor, Blazor, MVC, Minimal API, hepsini denedim. Minimal API’dan sonra MVC’nin yüzüne bakmam.',
    ),
  },
  {
    id: 'frontend',
    title: L('Frontend', 'Frontend'),
    object: L(
      'They say frontend people aren’t real developers...',
      'Frontend’ciler yazılımcı değil diyorlar...',
    ),
    body: L(
      'The only layer people ever see and touch. This wretched thing carries the entire impression. If it is bad, nobody cares about the backend. Thanks to AI I never had to properly learn it, which is the only reason I still have my sanity. I have built things with Razor and plain CSS, and with React and Tailwind. Razor does the job if the project is not too tangled, but React is a serious relief.',
      'İnsanların gördüğü ve etkileşime girdiği tek katman. Tüm izlenimi bu meret veriyor. Bu kötüyse backend kimsenin umrunda değil. Yapay zeka sağolsun öğrenmek zorunda kalmadım da kafayı yemedim. Razor+dümdüz css ile de React+Tailwind ile de yaptım bir şeyler. Çok karışık proje değilse Razor iş görür ama React bayağı büyük rahatlık.',
    ),
  },
  {
    id: 'data',
    title: L('Databases and SQL', 'Veritabanı ve SQL'),
    object: L('We forget. The archive doesn’t.', 'Biz unuturuz, arşiv unutmaz'),
    body: L(
      'SQL Server. That is the whole list. My projects have not grown big enough to need Redis yet, but when they do I will move over and carry on. Cloud this, managed that — no need at all. You set up your own server, you drop it in, and lovely: all the control is yours.',
      'SQL Server. Başka da bir şey yok. Projelerim henüz Redis gerektirecek kadar büyümedi ama büyüyünce ona geçerim devam ederim. Bulutmuş oymuş buymuş hiç gerek yok. Sunucunu kendin kuruyorsun içine bunu basıyorsun oh mis gibi tüm kontrol sende.',
    ),
  },
  {
    id: 'infrastructure',
    title: L('Servers and Infrastructure', 'Sunucular ve Altyapı'),
    object: L('Speaking of servers...', 'Sunucu demişken...'),
    body: L(
      'One dedicated Windows box, one Windows VDS and one Debian VPS. Windows makes life easy for .NET + MSSQL. Web hosting, backups, databases... I set every bit of it up, and the person you would ring for support at 3 a.m. is also me.',
      '1 Dedicated Windows, 1 VDS Windows ve 1 VPS Debian sunucum var. .NET+MSSQL için Windows kolaylık oluyor. Web hosting, yedekler, database... Her şeyi ben kuruyorum ve gece 3’te destek için arayacağınız kişi yine benim.',
    ),
  },
  {
    id: 'security',
    title: L('Security', 'Güvenlik'),
    object: L('9999 days since the last incident', 'Son kazadan bu yana: 9999 gün'),
    body: L(
      'Security is mostly knowing not to do the stupid thing. "Don’t put .env in the public folder." "Mind your authentication and your authorization."... Every day, every second. Done right, you look like you are doing nothing at all. But one second of an open hole is enough to make you question your entire life.',
      'Güvenlik genelde aptalca şeyi yapmamayı bilmektir. ".env’i public klasöre koyma", "authentication ve authorization’a dikkat et"... Her gün, Her saniye. Doğru yapıldığında ise hiç iş yapmıyormuş gibi görünürsünüz. Ama bir saniyelik güvenlik açığı size hayatı sorgulatmaya yeter.',
    ),
  },
  {
    id: 'shipping',
    title: L('Shipping Software', 'Yazılımı Yayınlama'),
    object: L('We’ll just test it in prod...', 'Canlıda test ederiz yav...'),
    body: L(
      'Software that was never shipped never existed... Then again, offline software exists too... Never mind, philosophy is clearly not my thing. CI/CD, tests, versions, releases, git pull push merge rebase squash and dozens more. We will handle all of it, mate.',
      'Yayınlanmamış yazılım hiç var olmamıştır... Ama çevrimdışı yazılımlar da var gerçi... Neyse ne ya felsefe yapamadım. CI/CD, testler, versiyonlar, yayına alma, git pull push merge rebase squash ve daha onlarcası işte. Hallederiz abi hepsini.',
    ),
  },
  {
    id: 'contact',
    title: L('Contact', 'İletişim'),
    object: L(
      '$"{DateTime.Now.Year - 2000}" years old and single :)',
      '$"{DateTime.Now.Year - 2000}" yaşında ve bekarım :)',
    ),
    // The gesture differs by device, so the sentence names the one the reader
    // actually has. Everything else about the station is identical.
    body: isTouch
      ? L(
          'The road is not over yet. Go to the tokens and tap, or reach me at mr.muratozcan@gmail.com, and let us keep the journey going. Maybe we work out together what my title ought to be.',
          'Yol henüz bitmedi. Tokenlere gidip dokunun ya da mr.muratozcan@gmail.com adresinden ulaşın, yolculuğa devam edelim. Belki ünvanımın ne olması gerektiğini de beraber çözeriz.',
        )
      : L(
          'The road is not over yet. Go to the tokens and press E, or reach me at mr.muratozcan@gmail.com, and let us keep the journey going. Maybe we work out together what my title ought to be.',
          'Yol henüz bitmedi. Tokenlere gidip E’ye basın ya da mr.muratozcan@gmail.com adresinden ulaşın, yolculuğa devam edelim. Belki ünvanımın ne olması gerektiğini de beraber çözeriz.',
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
