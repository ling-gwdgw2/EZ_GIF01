import { useState } from 'react';
import { GifMaker } from './components/GifMaker';
import { VideoToGif } from './components/VideoToGif';
import { GifEditor } from './components/GifEditor';
import { GifSplitter } from './components/GifSplitter';
import { GifToVideo } from './components/GifToVideo';
import { GifOptimizer } from './components/GifOptimizer';
import { VideoSplitter } from './components/VideoSplitter';
import { ImageConverter } from './components/ImageConverter';
import {
  Image as ImageIcon,
  Film,
  Edit3,
  LayoutDashboard,
  Info,
  ArrowRight,
  Shield,
  Zap,
  Grid,
  Video,
  Scissors,
  RefreshCw
} from 'lucide-react';

type ActiveTab =
  | 'dashboard'
  | 'maker'
  | 'video'
  | 'editor'
  | 'splitter'
  | 'gifToVideo'
  | 'optimizer'
  | 'videoSplitter'
  | 'converter';

const TAB_INFO: Record<ActiveTab, { title: string; desc: string }> = {
  dashboard: {
    title: "เครื่องมือจัดการ GIF บนเบราว์เซอร์",
    desc: "สร้าง แก้ไข ปรับขนาด หรือแปลงวิดีโอเป็น GIF ได้อย่างรวดเร็ว ปลอดภัย และเสร็จสิ้นบนเครื่องของคุณภายในไม่กี่วินาที"
  },
  maker: {
    title: "GIF Maker",
    desc: "สร้างภาพเคลื่อนไหว GIF แบบกำหนดเองโดยการรวมรูปภาพนิ่งหลาย ๆ ภาพเข้าด้วยกัน"
  },
  video: {
    title: "Video to GIF",
    desc: "แปลงไฟล์วิดีโอของคุณ (MP4, WebM) ให้เป็นไฟล์ภาพเคลื่อนไหว GIF ที่เบาและแชร์ง่าย"
  },
  videoSplitter: {
    title: "Video Splitter",
    desc: "แยกวิดีโอออกมาเป็นชุดรูปภาพความละเอียดสูง (.png) รายเฟรมตามช่วงวินาทีที่ต้องการ"
  },
  editor: {
    title: "GIF Editor",
    desc: "ย่อขนาด ครอปรูป เร่งความเร็ว หรือใส่ฟิลเตอร์สีให้กับภาพเคลื่อนไหว GIF ของคุณ"
  },
  splitter: {
    title: "GIF Splitter",
    desc: "แยกเฟรมรูปภาพ GIF เคลื่อนไหวออกมาเป็นภาพนิ่ง PNG หลาย ๆ รูป"
  },
  gifToVideo: {
    title: "GIF to Video",
    desc: "แปลงไฟล์ภาพเคลื่อนไหว GIF ให้เป็นไฟล์วิดีโอตระกูล WebM เพื่อความสะดวกในการแชร์"
  },
  optimizer: {
    title: "GIF Optimizer",
    desc: "บีบอัดขนาดไฟล์ GIF เพื่อประหยัดพื้นที่และแบนด์วิดท์โดยการลดสีหรือเฟรมเรต"
  },
  converter: {
    title: "Universal File Converter",
    desc: "เครื่องมือแปลงไฟล์ครอบจักรวาล แปลงไฟล์ได้ทุกประเภท ทั้งรูปภาพ วิดีโอ เสียง และเอกสาร ทำงานบนเครื่องของคุณโดยตรง 100%"
  }
};

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  const navigateTo = (tab: ActiveTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-container">
      {/* Section Header (Dynamic Title & Description) */}
      <div className="section-header" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h1 className="section-title" style={{ fontSize: '2.5rem', margin: '0 auto 0.5rem auto' }}>
          {TAB_INFO[activeTab].title}
        </h1>
        <p className="section-desc" style={{ fontSize: '1.05rem', margin: '0 auto', maxWidth: '750px' }}>
          {TAB_INFO[activeTab].desc}
        </p>
      </div>

      {/* Sidebar Nav */}
      <aside className="sidebar-nav glass-panel">
        <button
          onClick={() => navigateTo('dashboard')}
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
        >
          <LayoutDashboard className="nav-item-icon" />
          หน้าหลัก (Dashboard)
        </button>

        <button
          onClick={() => navigateTo('maker')}
          className={`nav-item ${activeTab === 'maker' ? 'active' : ''}`}
        >
          <ImageIcon className="nav-item-icon" />
          GIF Maker
        </button>

        <button
          onClick={() => navigateTo('video')}
          className={`nav-item ${activeTab === 'video' ? 'active' : ''}`}
        >
          <Film className="nav-item-icon" />
          Video to GIF
        </button>

        <button
          onClick={() => navigateTo('videoSplitter')}
          className={`nav-item ${activeTab === 'videoSplitter' ? 'active' : ''}`}
        >
          <Scissors className="nav-item-icon" />
          Video Splitter
        </button>

        <button
          onClick={() => navigateTo('editor')}
          className={`nav-item ${activeTab === 'editor' ? 'active' : ''}`}
        >
          <Edit3 className="nav-item-icon" />
          GIF Editor
        </button>

        <button
          onClick={() => navigateTo('splitter')}
          className={`nav-item ${activeTab === 'splitter' ? 'active' : ''}`}
        >
          <Grid className="nav-item-icon" />
          GIF Splitter
        </button>

        <button
          onClick={() => navigateTo('gifToVideo')}
          className={`nav-item ${activeTab === 'gifToVideo' ? 'active' : ''}`}
        >
          <Video className="nav-item-icon" />
          GIF to Video
        </button>

        <button
          onClick={() => navigateTo('optimizer')}
          className={`nav-item ${activeTab === 'optimizer' ? 'active' : ''}`}
        >
          <Zap className="nav-item-icon" />
          GIF Optimizer
        </button>

        <button
          onClick={() => navigateTo('converter')}
          className={`nav-item ${activeTab === 'converter' ? 'active' : ''}`}
        >
          <RefreshCw className="nav-item-icon" />
          Universal Converter
        </button>
      </aside>


      {/* Main Split Layout */}
      <div className="app-layout">

        {/* Dynamic Workspace Area */}
        <main style={{ flexGrow: 1 }}>
          {activeTab === 'dashboard' && (
            <div className="main-content">
              {/* Bento Grid Dashboard */}
              <div className="bento-grid">

                {/* Card 1: GIF Maker */}
                <div className="feature-card glass-panel glass-panel-hover">
                  <div className="feature-icon-wrapper">
                    <ImageIcon size={26} />
                  </div>
                  <h3 className="feature-card-title">GIF Maker</h3>
                  <p className="feature-card-desc">
                    รวมภาพนิ่งหลายไฟล์เข้าด้วยกัน กำหนดความหน่วงเวลาและเรียงลำดับเฟรมด้วยเครื่องมือจัดการที่แสนง่ายดาย
                  </p>
                  <button onClick={() => navigateTo('maker')} className="feature-card-btn">
                    เริ่มสร้าง GIF
                    <ArrowRight size={16} />
                  </button>
                </div>

                {/* Card 2: Video to GIF */}
                <div className="feature-card glass-panel glass-panel-hover">
                  <div className="feature-icon-wrapper" style={{ color: 'var(--secondary)' }}>
                    <Film size={26} />
                  </div>
                  <h3 className="feature-card-title">Video to GIF</h3>
                  <p className="feature-card-desc">
                    แปลงไฟล์คลิปวิดีโอ MP4, WebM ของคุณให้เป็น GIF แบบไม่มีลายน้ำ ปรับแต่งเฟรมเรตและขนาดได้ทันที
                  </p>
                  <button onClick={() => navigateTo('video')} className="feature-card-btn">
                    เริ่มแปลงวิดีโอ
                    <ArrowRight size={16} />
                  </button>
                </div>

                {/* Card 3: Video Splitter */}
                <div className="feature-card glass-panel glass-panel-hover">
                  <div className="feature-icon-wrapper" style={{ color: '#fb7185' }}>
                    <Scissors size={26} />
                  </div>
                  <h3 className="feature-card-title">Video Splitter</h3>
                  <p className="feature-card-desc">
                    เลือกช่วงคลิปวิดีโอเพื่อแปลงออกมาเป็นชุดรูปภาพความละเอียดสูง (.png) ได้อย่างแม่นยำ
                  </p>
                  <button onClick={() => navigateTo('videoSplitter')} className="feature-card-btn">
                    เริ่มแยกรูปจากคลิป
                    <ArrowRight size={16} />
                  </button>
                </div>

                {/* Card 4: GIF Editor */}
                <div className="feature-card glass-panel glass-panel-hover">
                  <div className="feature-icon-wrapper" style={{ color: '#ec4899' }}>
                    <Edit3 size={26} />
                  </div>
                  <h3 className="feature-card-title">GIF Editor</h3>
                  <p className="feature-card-desc">
                    นำเข้าไฟล์ GIF เดิมมาดัดแปลง ปรับความยาว เร่งความเร็ว ครอปสัดส่วน หรือใส่โทนสีฟิลเตอร์เก๋ ๆ
                  </p>
                  <button onClick={() => navigateTo('editor')} className="feature-card-btn">
                    เริ่มแก้ไขไฟล์
                    <ArrowRight size={16} />
                  </button>
                </div>

                {/* Card 5: GIF Splitter */}
                <div className="feature-card glass-panel glass-panel-hover">
                  <div className="feature-icon-wrapper" style={{ color: '#10b981' }}>
                    <Grid size={26} />
                  </div>
                  <h3 className="feature-card-title">GIF Splitter</h3>
                  <p className="feature-card-desc">
                    แยกองค์ประกอบภาพเคลื่อนไหว GIF ออกเป็นไฟล์ภาพนิ่งรูปแบบ PNG คุณภาพสูงทีละเฟรมได้ทันที
                  </p>
                  <button onClick={() => navigateTo('splitter')} className="feature-card-btn">
                    เริ่มแยกเฟรม
                    <ArrowRight size={16} />
                  </button>
                </div>

                {/* Card 6: GIF to Video */}
                <div className="feature-card glass-panel glass-panel-hover">
                  <div className="feature-icon-wrapper" style={{ color: '#3b82f6' }}>
                    <Video size={26} />
                  </div>
                  <h3 className="feature-card-title">GIF to Video</h3>
                  <p className="feature-card-desc">
                    ส่งออกและแปลงภาพ GIF เคลื่อนไหวให้เปลี่ยนไปเป็นวิดีโอ WebM เพื่อใช้งานต่อบนสื่ออื่น ๆ
                  </p>
                  <button onClick={() => navigateTo('gifToVideo')} className="feature-card-btn">
                    เริ่มแปลงไฟล์
                    <ArrowRight size={16} />
                  </button>
                </div>

                {/* Card 7: GIF Optimizer */}
                <div className="feature-card glass-panel glass-panel-hover">
                  <div className="feature-icon-wrapper" style={{ color: '#eab308' }}>
                    <Zap size={26} />
                  </div>
                  <h3 className="feature-card-title">GIF Optimizer</h3>
                  <p className="feature-card-desc">
                    บีบอัดขนาดน้ำหนักไฟล์โดยการข้ามเฟรม ย่อขนาดสัดส่วน หรือลดพาเลทสีอย่างได้ผล
                  </p>
                  <button onClick={() => navigateTo('optimizer')} className="feature-card-btn">
                    เริ่มบีบอัดไฟล์
                    <ArrowRight size={16} />
                  </button>
                </div>

                {/* Card 8: Universal Converter */}
                <div className="feature-card glass-panel glass-panel-hover">
                  <div className="feature-icon-wrapper" style={{ color: 'var(--accent-green)' }}>
                    <RefreshCw size={26} />
                  </div>
                  <h3 className="feature-card-title">Universal Converter</h3>
                  <p className="feature-card-desc">
                    แปลงไฟล์ได้ทุกประเภท ทั้งรูปภาพ วิดีโอ เสียง และเอกสารข้อความ ทำงานบนเครื่องของคุณปลอดภัย 100%
                  </p>
                  <button onClick={() => navigateTo('converter')} className="feature-card-btn">
                    เริ่มแปลงไฟล์
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>

              {/* Security and speed advantages section */}
              <div className="glass-panel" style={{ padding: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                <div style={{ flex: '1 1 250px', display: 'flex', gap: '1rem' }}>
                  <div style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--secondary)', width: '48px', height: '48px', borderRadius: '0px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid var(--secondary)' }}>
                    <Zap size={22} />
                  </div>
                  <div>
                    <h4 style={{ color: 'white', marginBottom: '0.25rem', fontWeight: 600 }}>ความเร็วสูง (Instant Processing)</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      ประมวลผลดึงและสร้างเฟรมผ่านฮาร์ดแวร์ฝั่งไคลเอนต์โดยตรง ไม่ต้องเสียเวลาอัปโหลดและดาวน์โหลดจากคลาวด์
                    </p>
                  </div>
                </div>

                <div style={{ flex: '1 1 250px', display: 'flex', gap: '1rem' }}>
                  <div style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)', width: '48px', height: '48px', borderRadius: '0px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid var(--primary)' }}>
                    <Shield size={22} />
                  </div>
                  <div>
                    <h4 style={{ color: 'white', marginBottom: '0.25rem', fontWeight: 600 }}>ความเป็นส่วนตัว 100% (Local Privacy)</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      ไม่มีการเก็บประวัติไฟล์ วิดีโอ หรือข้อมูลใด ๆ ของคุณส่งออกไปยังเครือข่ายอินเทอร์เน็ต ความลับของคุณจะอยู่บนเครื่องของคุณเท่านั้น
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: activeTab === 'maker' ? 'block' : 'none' }}>
            <GifMaker />
          </div>
          <div style={{ display: activeTab === 'video' ? 'block' : 'none' }}>
            <VideoToGif />
          </div>
          <div style={{ display: activeTab === 'editor' ? 'block' : 'none' }}>
            <GifEditor />
          </div>
          <div style={{ display: activeTab === 'splitter' ? 'block' : 'none' }}>
            <GifSplitter />
          </div>
          <div style={{ display: activeTab === 'gifToVideo' ? 'block' : 'none' }}>
            <GifToVideo />
          </div>
          <div style={{ display: activeTab === 'optimizer' ? 'block' : 'none' }}>
            <GifOptimizer />
          </div>
          <div style={{ display: activeTab === 'videoSplitter' ? 'block' : 'none' }}>
            <VideoSplitter />
          </div>
          <div style={{ display: activeTab === 'converter' ? 'block' : 'none' }}>
            <ImageConverter />
          </div>
        </main>
      </div>

      {/* Premium Footer */}
      <footer className="app-footer" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center' }}>
        <div className="glass-panel" style={{ maxWidth: '800px', width: '100%', padding: '1rem', background: 'rgba(0,0,0,0.15)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'white', justifyContent: 'center' }}>
            <Info size={14} />
            <span>เกี่ยวกับแอป (Privacy & Info)</span>
          </div>
          พัฒนาเลียนแบบฟังก์ชันของ ezgif.com โดยทำการประมวลผลข้อมูลภาพและวิดีโอทั้งหมดผ่าน JavaScript Canvas บนคอมพิวเตอร์ของคุณโดยตรง ไม่มีการส่งข้อมูลรูปภาพขึ้นไปเก็บบน Server ใด ๆ ทั้งสิ้น
        </div>

        <p>© 2026 By ALING. All rights reserved. เครื่องมือจำลองประสิทธิภาพสูงของ <a href="https://ezgif.com/" target="_blank" rel="noreferrer">ezgif.com</a></p>
        <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>
          พัฒนาด้วย React • TypeScript • Vite • Canvas Web API
        </p>
      </footer>
    </div>
  );
}

export default App;
