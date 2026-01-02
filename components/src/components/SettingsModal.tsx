
import React, { useState } from 'react';
import { WordPressConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: WordPressConfig) => void;
  onKeyChange: () => Promise<void>;
  initialConfig?: WordPressConfig;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, onKeyChange, initialConfig }) => {
  const [config, setConfig] = useState<WordPressConfig>(initialConfig || {
    siteUrl: '',
    username: '',
    applicationPassword: '',
    customInstruction: '',
    defaultCategoryId: '',
    enableAiImage: true,
    aiImageCount: 1
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    const val = type === 'checkbox' ? (e.target as any).checked : (type === 'number' ? Number(value) : value);
    setConfig(prev => ({ ...prev, [name]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(config);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <i className="fa-solid fa-sliders text-indigo-600"></i> 시스템 최적화 설정
            </h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors text-slate-400">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-10">
          {/* API Key Management */}
          <section className="space-y-6">
            <h3 className="text-sm font-black text-rose-600 uppercase tracking-widest flex items-center gap-2">
              <i className="fa-solid fa-key text-lg"></i> Gemini API 키
            </h3>
            <button
              type="button"
              onClick={onKeyChange}
              className="w-full py-4 bg-white border-2 border-rose-200 rounded-2xl text-sm font-black text-rose-600 hover:border-rose-500 hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-rotate"></i> API 키 선택/전환
            </button>
          </section>

          {/* WordPress Connection */}
          <section className="space-y-6">
            <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
              <i className="fa-brands fa-wordpress text-lg"></i> 워드프레스 연결
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <input type="url" name="siteUrl" placeholder="사이트 URL" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none font-medium" value={config.siteUrl} onChange={handleChange} required />
              </div>
              <input type="text" name="username" placeholder="사용자 ID" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none font-medium" value={config.username} onChange={handleChange} required />
              <input type="password" name="applicationPassword" placeholder="앱 비밀번호" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none font-medium" value={config.applicationPassword} onChange={handleChange} required />
            </div>
          </section>

          {/* Image & SEO Optimization */}
          <section className="space-y-6">
            <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <i className="fa-solid fa-image text-lg"></i> 이미지 및 SEO 최적화
            </h3>
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-black text-emerald-900">본문 AI 실사 이미지 생성</span>
                  <span className="text-[10px] text-emerald-600 font-bold">글자 깨짐 방지 프롬프트가 적용된 리얼 사진</span>
                </div>
                <input type="checkbox" name="enableAiImage" checked={config.enableAiImage} onChange={handleChange} className="w-6 h-6 rounded-md" />
              </div>

              {config.enableAiImage && (
                <div className="pt-4 border-t border-emerald-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-emerald-800">본문 이미지 개수 (1-3장)</span>
                    <span className="text-sm font-black text-indigo-600">{config.aiImageCount}장</span>
                  </div>
                  <input 
                    type="range" 
                    name="aiImageCount" 
                    min="1" max="3" step="1"
                    value={config.aiImageCount || 1} 
                    onChange={handleChange}
                    className="w-full h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <p className="text-[9px] text-emerald-600 font-bold">* 각 이미지마다 다른 구도로 생성되어 본문 곳곳에 자동 배치됩니다.</p>
                </div>
              )}
            </div>
          </section>

          {/* Gem Instruction */}
          <section className="space-y-6 pb-4">
            <h3 className="text-sm font-black text-purple-600 uppercase tracking-widest flex items-center gap-2">
              <i className="fa-solid fa-gem text-lg"></i> 맞춤 지침 (Gem)
            </h3>
            <textarea name="customInstruction" rows={5} placeholder="지침 입력..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono outline-none" value={config.customInstruction} onChange={handleChange} />
          </section>
        </form>

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex gap-4">
          <button onClick={onClose} className="flex-1 py-4 text-slate-600 font-bold">취소</button>
          <button onClick={handleSubmit} className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white font-black shadow-xl">설정 저장</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
