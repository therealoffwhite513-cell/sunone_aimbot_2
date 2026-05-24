export function browserCenterToCanvas({
  rect,
  canvasWidth,
  canvasHeight,
  windowWidth,
  windowHeight
}) {
  const scaleX = canvasWidth / Math.max(1, rect.width);
  const scaleY = canvasHeight / Math.max(1, rect.height);
  return {
    x: (windowWidth / 2 - rect.left) * scaleX,
    y: (windowHeight / 2 - rect.top) * scaleY
  };
}

export function browserPointToCanvas({
  clientX,
  clientY,
  rect,
  canvasWidth,
  canvasHeight
}) {
  const scaleX = canvasWidth / Math.max(1, rect.width);
  const scaleY = canvasHeight / Math.max(1, rect.height);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}
