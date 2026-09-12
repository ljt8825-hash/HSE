#!/usr/bin/env python3
"""
去除图片白色背景并保存为PNG
"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("正在安装Pillow库...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

def remove_white_background(input_path, output_path, threshold=240):
    """
    去除白色背景
    
    Args:
        input_path: 输入图片路径
        output_path: 输出图片路径
        threshold: 白色阈值 (0-255)，高于此值的像素被视为白色
    """
    # 打开图片
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    for item in data:
        # 如果像素颜色接近白色 (R, G, B 都大于阈值)
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            # 设置为透明
            new_data.append((255, 255, 255, 0))
        else:
            # 保持原色
            new_data.append(item)
    
    # 更新图片数据
    img.putdata(new_data)
    
    # 保存为PNG
    img.save(output_path, "PNG")
    print(f"已保存透明背景图片: {output_path}")
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        input_file = r"F:\deploy\hse-dashboard\北控城市服务图标.jpg"
    else:
        input_file = sys.argv[1]
    
    output_file = r"F:\deploy\hse-dashboard\安全看板vben\apps\web-antd\public\logo-transparent.png"
    
    remove_white_background(input_file, output_file)