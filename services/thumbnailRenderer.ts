
export interface ThumbnailConfig {
  text: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
  borderWidth: number;
}

/**
 * 수익형 블로그를 위한 고가독성 썸네일 렌더러
 * - 고대비 색상 조합 및 강렬한 테두리 적용
 * - 텍스트 길이 자동 감지 및 폰트 크기 조절
 */
export const renderThumbnailToBase64 = async (config: ThumbnailConfig): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error("Canvas context is not available");

  await document.fonts.ready;

  const { text, bgColor, textColor, borderColor, fontSize, fontWeight, lineHeight, borderWidth } = config;

  // 1. 배경 및 강력한 테두리 (Border)
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (borderWidth > 0) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth * 2; // 시각적 강화를 위해 2배 적용
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }

  // 2. 텍스트 정제 (불필요한 공백 제거)
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
  
  // 3. 동적 폰트 크기 계산 (유연한 조절)
  let currentFontSize = fontSize;
  const padding = 120 + (borderWidth * 2);
  const maxWidth = canvas.width - padding;
  
  ctx.font = `${fontWeight} ${currentFontSize}px 'NanumSquareNeo', sans-serif`;
  
  // 가장 긴 줄 기준으로 폰트 크기 자동 축소
  lines.forEach(line => {
    let metrics = ctx.measureText(line);
    while (metrics.width > maxWidth && currentFontSize > 50) {
      currentFontSize -= 5;
      ctx.font = `${fontWeight} ${currentFontSize}px 'NanumSquareNeo', sans-serif`;
      metrics = ctx.measureText(line);
    }
  });

  // 4. 수직 중앙 정렬 계산
  const totalLineHeight = currentFontSize * lineHeight;
  const totalBlockHeight = lines.length * totalLineHeight;
  let currentY = (canvas.height - totalBlockHeight) / 2 + (totalLineHeight / 2);

  // 5. 텍스트 드로잉 (가독성을 위한 미세한 그림자 추가)
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // 텍스트 가독성 보정용 그림자 (Shadow)
  ctx.shadowColor = 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  lines.forEach((line) => {
    ctx.fillText(line, canvas.width / 2, currentY);
    currentY += totalLineHeight;
  });

  // 6. WebP 고품질 변환 (SEO 및 용량 최적화)
  return canvas.toDataURL('image/webp', 0.9).split(',')[1];
};
