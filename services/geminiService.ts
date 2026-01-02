
import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedPost, AuditResult, GroundingUrl } from "../types";
import { renderThumbnailToBase64 } from "./thumbnailRenderer";

// [수익형 블로그 전용] 고대비 컬러 팔레트 (신한, 카카오, 토스 등 주요 금융권/서비스 컬러 차용)
const THEMES = [
  { id: 1, name: '신한-블루', metaBg: '#FFFFFF', primary: '#0052FF', borderColor: '#0052FF' }, 
  { id: 2, name: '카카오-옐로우', metaBg: '#FFEB00', primary: '#191919', borderColor: '#191919' }, 
  { id: 3, name: '주의-강력-레드', metaBg: '#FFFFFF', primary: '#E53935', borderColor: '#E53935' }, 
  { id: 4, name: '모던-다크-민트', metaBg: '#121212', primary: '#00FFCC', borderColor: '#00FFCC' },   
  { id: 5, name: '토스-퍼플', metaBg: '#FFFFFF', primary: '#7C4DFF', borderColor: '#7C4DFF' }, 
  { id: 6, name: '네이버-딥그린', metaBg: '#03C75A', primary: '#FFFFFF', borderColor: '#FFFFFF' }    
];

const AD_CODE_1 = `<div class="ad-container" style="text-align:center; margin:35px 0;"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7040793716815812" crossorigin="anonymous"></script><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-7040793716815812" data-ad-slot="5367387418" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script></div>`;
const AD_CODE_2 = `<div class="ad-container" style="text-align:center; margin:40px 0;"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7040793716815812" crossorigin="anonymous"></script><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-7040793716815812" data-ad-slot="5367387418" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script></div>`;

const getSystemInstruction = (theme: typeof THEMES[0], mainKeyword: string, analysisStrategy?: string) => 
  `당신은 구글 애드센스 수익 극대화 전문가이자 최고의 SEO 블로거입니다. 
다음 [수익화 및 SEO 지침]을 엄격히 준수하세요:

1. [CTR 최적화]: 사용자가 검색결과에서 클릭할 수밖에 없는 [THUMBNAIL_TEXT]를 3줄 이내로 만드세요. 예시: "신한은행\n공동인증서\n발급 3분컷"
2. [Dwell Time 확보]: 리얼 후기 문체를 사용하여 독자가 끝까지 읽도록 유도하세요.
3. [Technical SEO]: 본문 내 <strong> 태그를 활용하여 핵심 키워드를 강조하세요. (마크다운 ** 사용 절대 금지)
4. [광고 전략]: 수익률이 가장 높은 지점에 [AD1], [AD2]를 배치하세요.
5. [메타 정보]: 구글 스니펫에 노출될 수 있는 강력한 120자 이내의 [EXCERPT]를 작성하세요.

${analysisStrategy ? `[사용자 정의 전략]: ${analysisStrategy}` : ''}`;

/**
 * SEO 최적화 이미지 생성 (Alt 텍스트 및 SEO 친화적 메타 정보 포함)
 */
const generateTopicImage = async (topic: string, index: number): Promise<{data: string, alt: string, seoName: string} | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const viewStyles = ["natural document photography", "clean product shot style", "realistic lifestyle photo"];
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{
          text: `A high-quality real photograph of ${topic}, ${viewStyles[index % 3]}. 
          Absolutely NO TEXT, NO LOGOS, NO LETTERS. 
          The image must look like a natural photo taken by a person for a blog. 
          Zero gibberish characters.`,
        }],
      },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const seoName = `${topic.replace(/[^a-zA-Z0-9가-힣]/g, '-').substring(0, 25)}-${index + 1}`;
        return { 
          data: part.inlineData.data, 
          alt: `${topic} - 실제 사용 예시 및 참고 사진 ${index + 1}`,
          seoName: seoName
        };
      }
    }
    return null;
  } catch (e) {
    console.error("Image SEO generation failed:", e);
    return null;
  }
};

export const generateSEOContent = async (topicLine: string, config: { customInstruction?: string; enableAiImage?: boolean; aiImageCount?: number }): Promise<GeneratedPost> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const parts = topicLine.split('///').map(s => s.trim());
  const displayTitle = parts[0];
  const mainKeyword = parts[1] || displayTitle;
  const analysisStrategy = parts[2] || "";

  const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const systemBase = (config.customInstruction || getSystemInstruction(randomTheme, mainKeyword, analysisStrategy)) + 
    "\n필수 태그 구조: [TITLE], [EXCERPT], [THUMBNAIL_TEXT], [CONTENT]";
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `주제: ${displayTitle}\n키워드: ${mainKeyword}\n작성 시작.`,
      config: {
        systemInstruction: systemBase,
        thinkingConfig: { thinkingBudget: 32768 },
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text || "";
    const extract = (tag: string) => {
      const start = text.indexOf(`[${tag}]`);
      const end = text.indexOf(`[/${tag}]`);
      if (start !== -1 && end !== -1) return text.substring(start + `[${tag}]`.length, end).trim();
      return "";
    };

    const title = extract("TITLE") || displayTitle;
    const excerpt = extract("EXCERPT");
    const thumbnailText = extract("THUMBNAIL_TEXT");
    let content = extract("CONTENT");

    if (config.enableAiImage) {
      const count = Math.min(config.aiImageCount || 1, 3);
      for (let i = 0; i < count; i++) {
        const img = await generateTopicImage(displayTitle, i);
        if (img) {
          const imgHtml = `<div class="seo-img-container" style="margin: 40px 0; border-radius: 15px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
            <img src="data:image/webp;base64,${img.data}" alt="${img.alt}" title="${img.alt}" loading="lazy" style="width: 100%; display: block; border: 0;">
            <p style="text-align:center; color:#888; font-size:12px; margin-top:10px;">${img.alt}</p>
          </div>`;
          
          if (i === 0) content = imgHtml + content;
          else {
            const h2Tags = content.split('<h2>');
            if (h2Tags.length > i + 1) {
              h2Tags[i + 1] = imgHtml + h2Tags[i + 1];
              content = h2Tags.join('<h2>');
            } else {
              content += imgHtml;
            }
          }
        }
      }
    }

    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    content = content.replace(/\[AD1\]/g, AD_CODE_1).replace(/\[AD2\]/g, AD_CODE_2);

    let thumbnailData: string | undefined = undefined;
    if (thumbnailText) {
      thumbnailData = await renderThumbnailToBase64({
        fontSize: 120, fontWeight: '900', lineHeight: 1.1, borderWidth: 35, // 더 두꺼운 테두리로 CTR 강화
        text: thumbnailText,
        bgColor: randomTheme.metaBg, textColor: randomTheme.primary, borderColor: randomTheme.primary
      });
    }

    return { title, content, excerpt, thumbnailData, status: 'draft' };
  } catch (e) {
    throw e;
  }
};

export const auditContent = async (post: GeneratedPost, instruction: string): Promise<AuditResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `다음 콘텐츠의 SEO 가치를 수치화(100점 만점)하고 근거를 JSON으로 출력: ${post.content}`,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            review: { type: Type.STRING },
            passed: { type: Type.BOOLEAN }
          },
          required: ["score", "review", "passed"]
        }
      }
    });
    const res = JSON.parse(response.text || '{}');
    return { isHtmlValid: true, brokenUrls: [], guidelineScore: res.score || 0, aiReview: res.review || "", passed: !!res.passed };
  } catch {
    return { isHtmlValid: true, brokenUrls: [], guidelineScore: 0, aiReview: "검토 실패", passed: false };
  }
};
