
import React, { useState, useEffect, useRef } from 'react';
import { AppStatus, WordPressConfig, GeneratedPost, BulkItem, DashboardStats } from './types';
import { generateSEOContent, auditContent } from './services/geminiService';
import { publishToWordPress, fetchScheduledPosts, deleteWordPressPost, updatePostDate, fetchPostStats } from './services/wordPressService';
import SettingsModal from './components/SettingsModal';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'writer' | 'manager'>('writer');
  const [bulkInput, setBulkInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  
  const [startDateTime, setStartDateTime] = useState(() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [publishMode, setPublishMode] = useState<'draft' | 'publish' | 'future'>('future');
  
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [queue, setQueue] = useState<BulkItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  
  const [wpConfig, setWpConfig] = useState<WordPressConfig | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState<GeneratedPost[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [previewPost, setPreviewPost] = useState<GeneratedPost | null>(null);

  const [stats, setStats] = useState<DashboardStats>({
    unprocessed: 0,
    localPending: 0,
    wpDraft: 0,
    wpFuture: 0,
    wpPublish: 0
  });

  const isPausedRef = useRef(false);

  useEffect(() => {
    const checkApiKey = async () => {
      const aiStudio = (window as any).aistudio;
      if (aiStudio) {
        const selected = await aiStudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkApiKey();

    const saved = localStorage.getItem('wp_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      setWpConfig(parsed);
      refreshStats(parsed);
      loadRemotePosts(parsed);
    }
  }, []);

  const refreshStats = async (config: WordPressConfig) => {
    try {
      const wpStats = await fetchPostStats(config);
      const rawLines = bulkInput.split('\n');
      let count = 0;
      rawLines.forEach(line => { if(line.includes('///')) count++; });

      const localPending = queue.filter(q => q.status === 'pending' || q.status === 'generating' || q.status === 'publishing').length;
      
      setStats({
        unprocessed: count,
        localPending,
        ...wpStats
      });
    } catch (e) {
      console.error("Stats refresh error:", e);
    }
  };

  useEffect(() => {
    if (wpConfig) refreshStats(wpConfig);
  }, [bulkInput, queue, wpConfig]);

  const handleOpenKeySelector = async () => {
    const aiStudio = (window as any).aistudio;
    if (aiStudio) {
      await aiStudio.openSelectKey();
      setHasApiKey(true);
      setErrorReason(null);
      if (status === AppStatus.PAUSED) {
        resumeBatch();
      }
    }
  };

  const toWordPressDate = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const loadRemotePosts = async (config: WordPressConfig) => {
    if (!config.siteUrl) return;
    setIsLoadingList(true);
    try {
      const posts = await fetchScheduledPosts(config);
      setScheduledPosts(posts);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleDeletePost = async (id: number) => {
    if (!wpConfig) return;
    if (!window.confirm("정말로 이 포스트를 삭제하시겠습니까?")) return;
    try {
      await deleteWordPressPost(wpConfig, id);
      await loadRemotePosts(wpConfig);
      refreshStats(wpConfig);
    } catch (err: any) {
      alert("삭제 실패: " + err.message);
    }
  };

  const handleReschedule = async (id: number, currentDate: string) => {
    if (!wpConfig) return;
    const newDate = window.prompt("새로운 발행 일시를 입력하세요 (YYYY-MM-DDTHH:mm:ss)", currentDate);
    if (!newDate) return;
    try {
      await updatePostDate(wpConfig, id, newDate);
      await loadRemotePosts(wpConfig);
    } catch (err: any) {
      alert("날짜 수정 실패: " + err.message);
    }
  };

  const parseBulkInput = (input: string): string[] => {
    const lines = input.split('\n');
    const items: string[] = [];
    let currentItem = "";

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.includes('///')) {
        if (currentItem) items.push(currentItem);
        currentItem = trimmed;
      } else {
        if (currentItem) {
          currentItem += "\n" + trimmed;
        }
      }
    });

    if (currentItem) items.push(currentItem);
    return items;
  };

  const startBatch = async () => {
    if (!hasApiKey) {
      setIsSettingsOpen(true);
      alert("Gemini API 키를 먼저 선택해주세요.");
      return;
    }
    if (!bulkInput.trim() || !wpConfig) {
      alert("입력 내용이나 워드프레스 설정이 부족합니다.");
      return;
    }
    
    const parsedItems = parseBulkInput(bulkInput);
    if (parsedItems.length === 0) {
      alert("입력 형식을 확인하세요 (제목///키워드///전략).");
      return;
    }

    const newQueue: BulkItem[] = parsedItems.map(item => ({ topic: item, status: 'pending' }));
    setQueue(newQueue);
    setStatus(AppStatus.PROCESSING);
    setErrorReason(null);
    isPausedRef.current = false;
    
    processQueue(0, newQueue);
  };

  const resumeBatch = () => {
    if (currentIndex === -1) return;
    setStatus(AppStatus.PROCESSING);
    isPausedRef.current = false;
    processQueue(currentIndex, queue);
  };

  const processQueue = async (startIndex: number, currentQueue: BulkItem[]) => {
    const baseStartTime = new Date(startDateTime);

    for (let i = startIndex; i < currentQueue.length; i++) {
      if (isPausedRef.current) break;

      setCurrentIndex(i);
      setQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'generating' } : item));

      try {
        if (!wpConfig) throw new Error("설정 정보가 없습니다.");

        const post = await generateSEOContent(currentQueue[i].topic, {
          customInstruction: wpConfig.customInstruction,
          enableAiImage: wpConfig.enableAiImage,
          aiImageCount: wpConfig.aiImageCount
        });
        const audit = await auditContent(post, wpConfig.customInstruction || "");
        
        post.audit = audit;
        post.status = publishMode;

        const scheduledTime = new Date(baseStartTime.getTime() + (i * intervalMinutes * 60000));
        post.date = toWordPressDate(scheduledTime);

        setQueue(prev => prev.map((item, idx) => (
          idx === i ? { ...item, status: 'publishing', result: post } : item
        )));

        const wpResult = await publishToWordPress(wpConfig, post);
        
        setQueue(prev => prev.map((item, idx) => (
          idx === i ? { ...item, status: 'completed', result: { ...post, id: wpResult.id } } : item
        )));

        refreshStats(wpConfig);

      } catch (err: any) {
        console.error("Batch Job Error:", err);
        const errorMsg = err.message || "알 수 없는 오류";
        const isQuotaError = errorMsg.includes("429") || errorMsg.includes("Quota") || errorMsg.includes("exhausted") || errorMsg.includes("not found");
        
        if (isQuotaError) {
          setErrorReason("현재 프로젝트의 무료 할당량이 모두 소진되었습니다. 다음 프로젝트 API 키로 전환하면 자동으로 재개합니다.");
          setStatus(AppStatus.PAUSED);
          isPausedRef.current = true;
          setQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'failed', error: "할당량 소진 (일시정지)" } : item));
          break;
        }

        setQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'failed', error: errorMsg } : item));
      }
    }
    
    if (!isPausedRef.current) {
      setStatus(AppStatus.IDLE);
      setCurrentIndex(-1);
    }
    if (wpConfig) loadRemotePosts(wpConfig);
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('ko-KR', { 
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      hour: '2-digit', minute: '2-digit' 
    });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 selection:bg-indigo-100">
      <header className="bg-white/90 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-40 px-5 h-20 flex flex-col justify-center shadow-sm">
        <div className="max-w-xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100 rotate-3 group transition-transform hover:rotate-0">
              <i className="fa-solid fa-wand-magic-sparkles text-xl group-hover:scale-110 transition-transform"></i>
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter text-slate-800 flex items-center gap-1.5">
                Gem SEO Master
                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter">SEO EXPERT</span>
              </h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">AdSense & Google Optimization</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleOpenKeySelector}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 border ${hasApiKey ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100 animate-pulse'}`}
            >
              <i className="fa-solid fa-key"></i> {hasApiKey ? 'PROJECT ACTIVE' : 'KEY SELECT'}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-white hover:shadow-md transition-all">
              <i className="fa-solid fa-sliders"></i>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-6">
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase">Unprocessed</span>
            <span className="text-lg font-black text-slate-800">{stats.unprocessed}</span>
          </div>
          <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-100 shadow-sm flex flex-col items-center">
            <span className="text-[10px] font-black text-indigo-400 uppercase">Waiting</span>
            <span className="text-lg font-black text-indigo-600">{stats.localPending}</span>
          </div>
          <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 shadow-sm flex flex-col items-center">
            <span className="text-[10px] font-black text-amber-400 uppercase">Draft</span>
            <span className="text-lg font-black text-amber-600">{stats.wpDraft}</span>
          </div>
          <div className="bg-purple-50 p-3 rounded-2xl border border-purple-100 shadow-sm flex flex-col items-center">
            <span className="text-[10px] font-black text-purple-400 uppercase">Future</span>
            <span className="text-lg font-black text-purple-600">{stats.wpFuture}</span>
          </div>
          <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 shadow-sm flex flex-col items-center">
            <span className="text-[10px] font-black text-emerald-400 uppercase">Published</span>
            <span className="text-lg font-black text-emerald-600">{stats.wpPublish}</span>
          </div>
        </div>

        {errorReason && (
          <div className="bg-gradient-to-br from-rose-50 to-white border-2 border-rose-100 p-6 rounded-[2.5rem] flex flex-col gap-4 shadow-2xl shadow-rose-100 animate-in slide-in-from-top duration-500">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-200">
                <i className="fa-solid fa-bolt-lightning text-2xl animate-pulse"></i>
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-rose-900">할당량 초과 - 일시 정지됨</p>
                <p className="text-[11px] text-rose-700 font-bold leading-relaxed">{errorReason}</p>
              </div>
            </div>
            <button 
              onClick={handleOpenKeySelector}
              className="w-full py-4 bg-rose-600 text-white rounded-2xl text-xs font-black hover:bg-rose-700 transition-all shadow-xl shadow-rose-200 active:scale-[0.98]"
            >
              다음 프로젝트 API 키 선택하고 이어서 하기
            </button>
          </div>
        )}

        <div className="flex bg-slate-200/50 p-1.5 rounded-[2rem] gap-1">
          <button 
            onClick={() => setActiveTab('writer')}
            className={`flex-1 py-3.5 rounded-[1.5rem] text-xs font-black transition-all ${activeTab === 'writer' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}
          >
            <i className="fa-solid fa-pen-nib mr-2"></i>포스팅 대기열
          </button>
          <button 
            onClick={() => setActiveTab('manager')}
            className={`flex-1 py-3.5 rounded-[1.5rem] text-xs font-black transition-all ${activeTab === 'manager' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}
          >
            <i className="fa-solid fa-list-check mr-2"></i>발행 현황 관리
          </button>
        </div>

        {activeTab === 'writer' ? (
          <div className="space-y-6">
            <section className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/40 border border-white space-y-6">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <i className="fa-solid fa-layer-group"></i> 일괄 생성 주제 입력
                  </label>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">AI PRO 32K</span>
                  <span className="text-[9px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">SEO OPTIMIZED</span>
                </div>
              </div>
              
              <textarea
                rows={10}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="제목///키워드&#10;예: 신한은행 공동인증서 발급///신한은행 공동인증서"
                className="w-full p-6 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white rounded-[2rem] outline-none text-sm font-bold leading-relaxed transition-all resize-none shadow-inner placeholder:text-slate-300"
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase ml-1">간격 (분)</label>
                  <input type="number" value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-black border-none focus:ring-2 focus:ring-indigo-100" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase ml-1">발행 모드</label>
                  <select value={publishMode} onChange={(e) => setPublishMode(e.target.value as any)} className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-black border-none outline-none focus:ring-2 focus:ring-indigo-100 appearance-none">
                    <option value="future">📅 예약 발행</option>
                    <option value="publish">🚀 즉시 발행</option>
                    <option value="draft">📝 임시 저장</option>
                  </select>
                </div>
              </div>

              <button
                onClick={startBatch}
                disabled={status === AppStatus.PROCESSING || !bulkInput.trim()}
                className={`w-full py-5 rounded-3xl font-black text-lg shadow-xl transition-all active:scale-95 disabled:bg-slate-200 disabled:shadow-none ${status === AppStatus.PAUSED ? 'bg-rose-600 text-white shadow-rose-100' : 'bg-indigo-600 text-white shadow-indigo-100'}`}
              >
                {status === AppStatus.PROCESSING ? 'AI가 SEO 분석 및 집필 중...' : '대량 수익형 포스팅 시작'}
              </button>
            </section>

            {queue.length > 0 && (
              <div className="space-y-4">
                {queue.map((item, idx) => (
                  <div key={idx} className={`p-5 rounded-[2.5rem] border transition-all duration-500 ${idx === currentIndex ? 'bg-white border-indigo-200 ring-8 ring-indigo-50 shadow-2xl scale-[1.02]' : 'bg-white/60 border-slate-100 opacity-60'}`}>
                    <div className="flex gap-5 items-center">
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                        {item.result?.thumbnailData ? (
                          <img src={`data:image/webp;base64,${item.result.thumbnailData}`} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <i className={`fa-solid ${item.status === 'generating' ? 'fa-brain animate-pulse text-indigo-400' : (item.status === 'failed' ? 'fa-triangle-exclamation text-rose-400' : 'fa-clock text-slate-300')} text-xl`}></i>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                           <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase ${item.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : (item.status === 'failed' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600')}`}>
                             {item.status}
                           </span>
                           {item.result?.audit && (
                             <span className="text-[8px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">SEO: {item.result.audit.guidelineScore}점</span>
                           )}
                        </div>
                        <p className="text-[13px] font-black text-slate-800 line-clamp-1">{item.topic.split('///')[0]}</p>
                        <div className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1.5">
                          {item.status === 'failed' ? <span className="text-rose-500 font-black">{item.error}</span> : <><i className="fa-solid fa-calendar-check text-[9px]"></i> <span>{formatDate(item.result?.date)}</span></>}
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        {item.result && (
                          <button onClick={() => setPreviewPost(item.result!)} className="w-11 h-11 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                            <i className="fa-solid fa-eye text-xs"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">워드프레스 포스트 관리</h3>
              <button onClick={() => wpConfig && loadRemotePosts(wpConfig)} className="text-indigo-600 text-[11px] font-black bg-white border border-indigo-100 px-4 py-2.5 rounded-full hover:bg-indigo-50 transition-all shadow-sm">
                <i className={`fa-solid fa-rotate-right ${isLoadingList ? 'animate-spin' : ''}`}></i> 동기화
              </button>
            </div>

            {isLoadingList ? (
              <div className="py-24 flex flex-col items-center gap-5 text-slate-300">
                <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {scheduledPosts.map((post) => (
                  <div key={post.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
                    <div className="flex gap-5">
                      <div className="w-20 h-20 rounded-2xl bg-slate-50 flex-shrink-0 overflow-hidden border border-slate-100 shadow-inner">
                        {post.featuredMediaUrl ? <img src={post.featuredMediaUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-slate-200"><i className="fa-solid fa-image text-3xl"></i></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-black px-2.5 py-1 rounded-lg uppercase bg-indigo-50 text-indigo-600 border border-indigo-100">{post.status}</span>
                        <h4 className="text-[14px] font-black text-slate-800 line-clamp-1 mt-2 mb-1">{post.title}</h4>
                        <p className="text-[11px] font-bold text-slate-400 mb-4">{formatDate(post.date)}</p>
                        <div className="flex gap-2">
                          <button onClick={() => post.id && handleReschedule(post.id, post.date || "")} className="flex-1 bg-slate-50 text-slate-600 py-2 rounded-xl text-[10px] font-black hover:bg-indigo-600 hover:text-white transition-all">날짜수정</button>
                          <button onClick={() => post.id && handleDeletePost(post.id)} className="flex-1 bg-rose-50 text-rose-500 py-2 rounded-xl text-[10px] font-black hover:bg-rose-500 hover:text-white transition-all">삭제</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {previewPost && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4 sm:p-10 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-5xl h-full max-h-[92vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg shadow-emerald-100">
                  {previewPost.audit?.guidelineScore || '?'}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">{previewPost.title}</h3>
                  <p className="text-xs font-bold text-emerald-600">SEO 스코어 및 AdSense 최적화 분석 완료</p>
                </div>
              </div>
              <button onClick={() => setPreviewPost(null)} className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-slate-200">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 sm:p-20 bg-white">
              <div className="max-w-3xl mx-auto space-y-12">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-4">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <i className="fa-solid fa-magnifying-glass-chart"></i> AI SEO 자가 진단 리포트
                  </h4>
                  <p className="text-sm font-bold text-slate-600 leading-relaxed whitespace-pre-wrap">{previewPost.audit?.aiReview}</p>
                </div>

                {previewPost.thumbnailData && (
                  <div className="rounded-[3rem] overflow-hidden shadow-2xl border-[15px] border-white ring-1 ring-slate-100">
                    <img src={`data:image/webp;base64,${previewPost.thumbnailData}`} className="w-full aspect-square object-cover" alt="SEO Thumbnail" />
                  </div>
                )}
                <article className="prose prose-lg prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: previewPost.content }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {status === AppStatus.PROCESSING && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-5 rounded-full shadow-2xl flex items-center gap-5 z-50 border border-white/10">
          <div className="w-4 h-4 bg-indigo-500 rounded-full animate-ping"></div>
          <span className="text-xs font-bold">SEO 데이터 분석 및 고품질 포스팅 생성 중...</span>
        </div>
      )}

      <SettingsModal 
        isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} 
        onSave={(c) => { setWpConfig(c); localStorage.setItem('wp_config', JSON.stringify(c)); refreshStats(c); loadRemotePosts(c); }} 
        onKeyChange={handleOpenKeySelector} initialConfig={wpConfig || undefined} 
      />
    </div>
  );
};

export default App;
