1. 封装与 DOM 引用
```javascript
(function() {
    const canvas = document.getElementById('curveCanvas');
    const ctx = canvas.getContext('2d');
    ...
})();
IIFE 立即执行，创建独立作用域。

canvas 获取画布元素，ctx 获取 2D 渲染上下文。

2. 状态变量
javascript
let points = [];        // 存储控制点 { x, y }
let dragIndex = -1;     // 当前拖拽点索引
let isDragging = false; // 是否正在拖拽
const width = 800, height = 500;
const POINT_RADIUS = 6;
points 用于存储所有控制点的坐标。

dragIndex 与 isDragging 配合实现点的移动逻辑。

常量定义画布尺寸和点的视觉半径。

3. redraw() – 主渲染入口
javascript
function redraw() {
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    if (points.length >= 2) drawCurve();
    drawPoints();
}
每次数据变更（添加点、移动点、清空）后调用。

按顺序：清屏 → 辅助网格 → 曲线 → 点（点须最后绘制，位于曲线上方）

4. drawGrid() – 绘制参考网格
循环绘制 25px 间隔的浅色线，帮助定位。

5. drawPoints() – 绘制控制点
使用 ctx.arc 绘制圆形，外层红色描边 + 内层橙色填充，美观且易于观察。

6. drawCurve() – 核心曲线算法
特殊情况处理：
javascript
if (points.length === 2) {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    return;
}
只有两点时直接画直线。

Catmull-Rom 转贝塞尔：
javascript
const tension = 0.5;
const extended = [points[0], ...points, points[points.length - 1]];
for (let i = 0; i < extended.length - 3; i++) {
    const p0 = extended[i], p1 = extended[i+1], p2 = extended[i+2], p3 = extended[i+3];
    const cp1x = p1.x + (p2.x - p0.x) * (tension / 3);
    const cp1y = p1.y + (p2.y - p0.y) * (tension / 3);
    const cp2x = p2.x - (p3.x - p1.x) * (tension / 3);
    const cp2y = p2.y - (p3.y - p1.y) * (tension / 3);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
}
为什么扩展数组？ 为了使曲线从第一个点开始并结束于最后一个点，我们在首尾各复制一个端点作为虚拟控制点。

控制点公式来源：Catmull-Rom 曲线是三次 Hermite 曲线的特例，转换为三次贝塞尔曲线时，切线长度为相邻点差值的 tension/3 倍。

循环中每四个点生成一段从 p1 到 p2 的贝塞尔曲线，保证曲线经过 p1 和 p2，并且切线连续。

7. getMouseCoordinates(e) – 坐标转换
考虑 canvas 的实际像素尺寸与 CSS 显示尺寸的比例，保证鼠标映射到正确的绘图坐标。

支持触摸事件（移动端简单适配）。

8. hitTest(mouseX, mouseY) – 命中检测
遍历所有点，计算欧氏距离，若小于 POINT_RADIUS + 5 认为命中，返回索引。

9. addPoint(x, y) – 添加点（去重）
防止新点与现有点距离过近，保证编辑体验。

10. 鼠标事件监听
onMouseDown：先命中测试，命中则进入拖拽状态；否则添加新点。

onMouseMove：拖拽中时更新 points[dragIndex] 并调用 redraw() 实时更新视图。

onMouseUp / onMouseLeave：结束拖拽，重置状态。

11. 按钮功能
clearAllPoints：清空数组并重绘。

saveAsImage：利用 canvas.toDataURL 生成 PNG 并触发下载。

12. 初始化示例点与事件绑定
javascript
points = [ { x:150, y:350 }, { x:300, y:150 }, { x:500, y:200 }, { x:650, y:400 } ];
initEventListeners();
redraw();
提供四个初始点，方便用户立即看到曲线效果。
