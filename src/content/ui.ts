import { L } from './i18n';

/**
 * Chrome text: the loading screen, the settings panel, the control legend.
 *
 * Separate from stations.ts because that file is the site's content and this
 * is the frame around it — they change for different reasons.
 */

export const UI = {
  loadingWorld: L('building the world', 'dünya kuruluyor'),
  loadingStructure: L('laying the path', 'yol seriliyor'),
  loadingStations: L('placing the work', 'işler yerleştiriliyor'),
  loadingLandmarks: L('raising the landmarks', 'yapılar dikiliyor'),
  loadingTextures: L('hanging the pictures', 'resimler asılıyor'),
  loadingFirstFrame: L('opening your eyes', 'gözler açılıyor'),
    loadingHint: L(
    'Ready or not, here I come! You can not be ready tho. Everywhere is here, with nowhere to hide.',
    'Önüm arkam sağım solum sobe değil, aynı yere çıkıyor. Burada saklanacak yer maalesef yok.',
  ),

  rotate: L(
    'Best viewed on a desktop. On a phone, best in landscape. Turn it sideways.',
    'En iyisi bilgisayarda görüntülemek. İlla telefon diyorsanız telefonunuzu yan çevirin.',
  ),
  rotateDismiss: L('Continue anyway', 'Yine de devam et'),

  settings: L('Settings', 'Ayarlar'),
  fullscreen: L('Fullscreen', 'Tam ekran'),
  exitFullscreen: L('Exit fullscreen', 'Tam ekrandan çık'),
  reset: L('Reset to defaults', 'Varsayılanlara dön'),

  groupGeneral: L('General', 'Genel'),
  groupView: L('View', 'Görünüm'),
  groupControls: L('Controls', 'Kontroller'),
  groupPerformance: L('Performance', 'Performans'),
  groupDeveloper: L('Developer', 'Geliştirici'),

  language: L('Language', 'Dil'),
  fov: L('Field of view', 'Görüş açısı'),
    fovNote: L(
    'Adjusting your field of view to suit your preferences may help alleviate dizziness.',
    'Görüş açısını tercihinize göre ayarlamak baş dönmesine iyi gelebilir.',
  ),
  sensitivity: L('Camera sensitivity', 'Kamera hassasiyeti'),
  invertLook: L('Invert vertical look', 'Dikey bakışı ters çevir'),
  headBob: L('Head bob', 'Baş sallanması'),
  quality: L('Graphics quality', 'Grafik kalitesi'),
  qualityLow: L('Low', 'Düşük'),
  qualityMedium: L('Medium', 'Orta'),
  qualityHigh: L('High', 'Yüksek'),
  qualityNote: L(
    'Sets shadow detail. Drop it if the frame rate is uneven.',
    'Gölgelerin detaylarını belirler. Kare hızı düşükse bunu düşürün.',
  ),
  antialias: L('Antialiasing', 'Kenar yumuşatma'),
  antialiasOff: L('Off', 'Kapalı'),
  antialiasNote: L(
    'Smooths the jagged edges of distant geometry. Costs more the higher the resolution.',
    'Uzaktaki nesnelerin tırtıklı kenarlarını yumuşatır. Çözünürlük arttıkça maliyeti artar.',
  ),
  resolution: L('Resolution', 'Çözünürlük'),
  resolutionNote: L(
    'How many pixels are drawn per screen pixel. Higher is sharper and slower.',
    'Ekrandaki her piksel için kaç piksel çizileceği. Yüksek olan daha net, daha yavaş.',
  ),

  showHelp: L('Show controls', 'Kontrolleri göster'),
  showDetails: L('Show details', 'Ayrıntıları göster'),
  showTests: L('Show math self-tests', 'Matematik testlerini göster'),

  helpDesktop: L(
    `click for camera
WASD   move
Shift  sprint
E      interact
← →    look left/right
↑ ↓    look up/down`,
    `kamera için tıkla
WASD   hareket
Shift  koşu
E      etkileşim
← →    sağa/sola bak
↑ ↓    yukarı/aşağı bak`,
  ),
  helpTouch: L(
    `left side  move
right side  camera
tap         interact
hold ≫      sprint`,
    `sol taraf  hareket
sağ taraf      kamera
dokun          etkileşim
≫ basılı tut  koşu`,
  ),
};
