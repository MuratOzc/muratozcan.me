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
    'a closed world with no edge — walk far enough in any direction and you come back to where you started',
    'kenarı olmayan kapalı bir dünya — herhangi bir yöne yeterince yürüyün, başladığınız yere dönersiniz',
  ),

  rotate: L(
    'Best in landscape. Turn your phone sideways.',
    'En iyisi yatay. Telefonunuzu yan çevirin.',
  ),
  rotateDismiss: L('Continue anyway', 'Yine de devam et'),

  settings: L('Settings', 'Ayarlar'),
  reset: L('Reset to defaults', 'Varsayılanlara dön'),

  groupGeneral: L('General', 'Genel'),
  groupView: L('View', 'Görünüm'),
  groupControls: L('Controls', 'Kontroller'),
  groupPerformance: L('Performance', 'Başarım'),
  groupDeveloper: L('Developer', 'Geliştirici'),

  language: L('Language', 'Dil'),
  fov: L('Field of view', 'Görüş açısı'),
  fovNote: L(
    'Spherical space already distorts what you see. A wide angle stacks a second distortion on top of it.',
    'Küresel uzay görüntüyü zaten büküyor. Geniş açı bunun üstüne ikinci bir bükülme ekler.',
  ),
  sensitivity: L('Look sensitivity', 'Bakış hassasiyeti'),
  invertLook: L('Invert vertical look', 'Dikey bakışı ters çevir'),
  headBob: L('Head bob', 'Baş sallanması'),
  quality: L('Graphics quality', 'Grafik kalitesi'),
  qualityLow: L('Low', 'Düşük'),
  qualityMedium: L('Medium', 'Orta'),
  qualityHigh: L('High', 'Yüksek'),
  qualityNote: L(
    'Sets shadow detail and render resolution. Drop it if the frame rate is uneven.',
    'Gölge ayrıntısını ve çözünürlüğü belirler. Kare hızı düzensizse düşürün.',
  ),

  showHelp: L('Show controls', 'Kontrolleri göster'),
  showDetails: L('Show details', 'Ayrıntıları göster'),
  showDetailsNote: L(
    'Position, distance walked, frame rate.',
    'Konum, yürünen mesafe, kare hızı.',
  ),
  showTests: L('Show math self-tests', 'Matematik testlerini göster'),
  showTestsNote: L(
    'The curvature invariants, checked every load.',
    'Eğrilik değişmezleri, her açılışta denetlenir.',
  ),

  helpDesktop: L(
    `click to look
WASD   move
Shift  sprint
E      interact
← →    turn
↑ ↓    look up/down`,
    `bakmak için tıklayın
WASD   hareket
Shift  koşu
E      etkileşim
← →    dön
↑ ↓    yukarı/aşağı bak`,
  ),
  helpTouch: L(
    `left thumb  move
right side  look
tap         interact
hold ≫      sprint`,
    `sol başparmak  hareket
sağ taraf      bakış
dokun          etkileşim
≫ basılı tut  koşu`,
  ),
};
