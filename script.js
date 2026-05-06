/**
 * 曲线编辑器 - 原生 JavaScript 实现
 * 功能：添加/拖拽控制点，绘制 Catmull-Rom 平滑曲线
 */

(function() {
    // ---------- DOM 元素 ----------
    const canvas = document.getElementById('curveCanvas');
    const ctx = canvas.getContext('2d');
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');

    // ---------- 全局状态 ----------
    let points = [];            // 存储控制点 { x, y }
    let dragIndex = -1;        // 当前被拖拽的点的索引，-1 表示没有拖拽
    let isDragging = false;     // 鼠标是否处于拖拽移动状态

    // 画布实际尺寸 (与 CSS 宽高一致，避免缩放)
    const width = 800;
    const height = 500;
    canvas.width = width;
    canvas.height = height;

    // 控制点绘制半径
    const POINT_RADIUS = 6;

    // ---------- 辅助函数 ----------
    // 重新绘制整个画布 (点 + 曲线)
    function redraw() {
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);

        // 1. 绘制背景辅助网格 (轻量参考线)
        drawGrid();

        // 2. 绘制曲线 (如果点数>=2)
        if (points.length >= 2) {
            drawCurve();
        }

        // 3. 绘制所有控制点 (位于曲线上方，便于交互)
        drawPoints();
    }

    // 绘制网格 (每 25px 一条浅色线)
    function drawGrid() {
        ctx.save();
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 0.8;
        const step = 25;
        for (let x = step; x < width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = step; y < height; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // 绘制控制点 (圆形，带高亮外圈)
    function drawPoints() {
        ctx.save();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            ctx.beginPath();
            ctx.arc(p.x, p.y, POINT_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = "#ff7e5e";
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();
            // 内圈高光
            ctx.beginPath();
            ctx.arc(p.x, p.y, POINT_RADIUS - 2, 0, Math.PI * 2);
            ctx.fillStyle = "#f9a66c";
            ctx.fill();
        }
        ctx.restore();
    }

    /**
     * 使用 CatmullRom 插值绘制平滑曲线
     * 原理：需要将每四个连续控制点转换为两个三次贝塞尔曲线段
     * 参考公式：张力参数 tension = 0.5 (默认)
     * 对于点 P0,P1,P2,P3，曲线从 P1 到 P2，贝塞尔控制点为：
     *   B1 = P1 + (P2 - P0) * (tension/3)
     *   B2 = P2 - (P3 - P1) * (tension/3)
     * 若只有两个点，直接绘制直线。
     */
    function drawCurve() {
        if (points.length < 2) return;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "#2c5282";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        // 对于只有两个点的情况，画直线
        if (points.length === 2) {
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            ctx.stroke();
            ctx.restore();
            return;
        }

        // 对于 >=3 个点，使用 CatmullRom 生成平滑路径
        const tension = 0.5;  // 张力系数，0.5 为标准 CatmullRom

        // 为方便边界处理，在首尾增加虚拟点（与端点重合，保证曲线经过端点）
        const extended = [points[0], ...points, points[points.length - 1]];

        for (let i = 0; i < extended.length - 3; i++) {
            const p0 = extended[i];
            const p1 = extended[i + 1];
            const p2 = extended[i + 2];
            const p3 = extended[i + 3];

            // 计算贝塞尔控制点
            const cp1x = p1.x + (p2.x - p0.x) * (tension / 3);
            const cp1y = p1.y + (p2.y - p0.y) * (tension / 3);
            const cp2x = p2.x - (p3.x - p1.x) * (tension / 3);
            const cp2y = p2.y - (p3.y - p1.y) * (tension / 3);

            // 曲线段的起点和终点
            if (i === 0) {
                ctx.moveTo(p1.x, p1.y);
            }
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // 找到鼠标坐标 (相对于 canvas 的原始像素坐标)
    function getMouseCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;   // canvas 物理像素与 CSS 比例
        const scaleY = canvas.height / rect.height;
        let clientX, clientY;

        if (e.touches) {
            // 移动端触摸支持 (额外简易支持)
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        let canvasX = (clientX - rect.left) * scaleX;
        let canvasY = (clientY - rect.top) * scaleY;
        canvasX = Math.min(Math.max(0, canvasX), width);
        canvasY = Math.min(Math.max(0, canvasY), height);
        return { x: canvasX, y: canvasY };
    }

    // 检测是否命中某个控制点 (欧氏距离 <= 半径+5px 便于点击)
    function hitTest(mouseX, mouseY) {
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const dx = p.x - mouseX;
            const dy = p.y - mouseY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist <= POINT_RADIUS + 5) {
                return i;
            }
        }
        return -1;
    }

    // 添加新点 (不允许重复极近的点, 避免重叠)
    function addPoint(x, y) {
        // 避免在已有点的附近创建 (距离小于半径则忽略)
        const tooClose = points.some(p => Math.hypot(p.x - x, p.y - y) < POINT_RADIUS * 1.5);
        if (tooClose) return false;
        points.push({ x, y });
        redraw();
        return true;
    }

    // ---------- 事件监听 (鼠标 + 触摸) ----------
    function onMouseDown(e) {
        e.preventDefault();
        const { x, y } = getMouseCoordinates(e);
        // 先检查是否点到控制点
        const hit = hitTest(x, y);
        if (hit !== -1) {
            dragIndex = hit;
            isDragging = true;
            canvas.style.cursor = "grabbing";
            return;
        }
        // 否则添加新点
        addPoint(x, y);
    }

    function onMouseMove(e) {
        if (!isDragging || dragIndex === -1) return;
        e.preventDefault();
        const { x, y } = getMouseCoordinates(e);
        // 更新被拖拽点的坐标
        points[dragIndex] = { x, y };
        redraw();    // 实时重绘
        canvas.style.cursor = "grabbing";
    }

    function onMouseUp(e) {
        if (isDragging) {
            isDragging = false;
            dragIndex = -1;
            canvas.style.cursor = "crosshair";
            redraw(); // 最后重绘一次保证稳定
        }
    }

    // 离开canvas时也要释放拖拽状态
    function onMouseLeave(e) {
        if (isDragging) {
            isDragging = false;
            dragIndex = -1;
            canvas.style.cursor = "crosshair";
            redraw();
        }
    }

    // ---------- 按钮功能 ----------
    function clearAllPoints() {
        points = [];
        redraw();
    }

    function saveAsImage() {
        // 将 canvas 转为图片并下载
        try {
            const link = document.createElement('a');
            link.download = 'curve_editor.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch(err) {
            alert("保存失败：" + err.message);
        }
    }

    // ---------- 初始化事件绑定 ----------
    function initEventListeners() {
        canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseLeave);

        // 移动端基础支持 (以便触屏使用)
        canvas.addEventListener('touchstart', onMouseDown);
        window.addEventListener('touchmove', onMouseMove);
        window.addEventListener('touchend', onMouseUp);
        canvas.addEventListener('touchcancel', onMouseLeave);

        clearBtn.addEventListener('click', clearAllPoints);
        saveBtn.addEventListener('click', saveAsImage);
    }

    // 启动应用
    function init() {
        initEventListeners();
        // 设置几个示例点，展示曲线效果
        points = [
            { x: 150, y: 350 },
            { x: 300, y: 150 },
            { x: 500, y: 200 },
            { x: 650, y: 400 }
        ];
        redraw();
    }

    init();
})();