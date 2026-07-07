from flask import Flask, render_template, request, jsonify, Response
import base64
import json
import time
import os
from openai import OpenAI
from dotenv import load_dotenv

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max upload

# ============================================================
# 配置区：根据你的部署方式选择一种调用方式
# ============================================================

# 加载配置文件
load_dotenv(os.path.expanduser('~/.env'))
load_dotenv()

# 方式一：使用 DashScope（阿里云通义千问官方 API）
USE_DASHSCOPE = False
DASHSCOPE_API_KEY = os.environ.get("Math_Solver_Ali_API_KEY")

# 方式二：使用 OpenAI 兼容接口（如 vLLM / Ollama / 其他部署）
USE_OPENAI_COMPAT = True
OPENAI_API_KEY = os.environ.get("Math_Solver_Ali_API_KEY")
OPENAI_BASE_URL = os.environ.get("QWEN_OPENAI_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
MODEL_NAME = os.environ.get("MODEL_NAME", "qwen3-vl-32b-thinking")
#print(OPENAI_API_KEY, OPENAI_BASE_URL, MODEL_NAME)

def build_system_prompt():
    """构建系统提示词"""
    return """你是一位专业的数学解题助手。你的任务是根据用户提供的题目信息（包括文字描述、数学公式、几何图形、坐标系图、立体图形、表格数据等），给出详细、准确的解题过程。

要求：
1. 使用 LaTeX 公式格式输出所有数学表达式，使用 $...$ 表示行内公式，使用 $$...$$ 表示块级公式。
2. 解题过程要步骤清晰，逻辑严谨。
3. 如果提供了图片，请仔细分析图片中的几何关系、坐标信息或数据。
4. 对于几何图形，注意区分实线和虚线所代表的含义（实线表示可见边/已知条件，虚线表示辅助线/不可见边）。
5. 对于表格数据，请准确提取并利用其中的数值信息。
6. 最终答案请用 \boxed{} 框出。
7. 如有多种解法，请给出最优解法，并简要提及其他解法思路。"""


def build_user_prompt(text_input, notes, image_descriptions):
    """构建用户提示词"""
    prompt_parts = []

    if text_input.strip():
        prompt_parts.append(f"【题目内容】\n{text_input.strip()}")

    if image_descriptions:
        prompt_parts.append("【图片说明】")
        for i, desc in enumerate(image_descriptions, 1):
            prompt_parts.append(f"  图片{i}: {desc}")

    if notes.strip():
        prompt_parts.append(f"【备注信息】\n{notes.strip()}")

    prompt_parts.append("\n请根据以上信息，给出详细的解题过程和最终答案。")

    return "\n\n".join(prompt_parts)


def encode_image_to_base64(file_storage):
    """将上传的图片转为 base64 编码"""
    image_data = file_storage.read()
    return base64.b64encode(image_data).decode('utf-8')


def get_mime_type(filename):
    """根据文件名获取 MIME 类型"""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    mime_map = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
    }
    return mime_map.get(ext, 'image/png')


def call_model_stream(text_input, notes, images, image_descriptions):
    """
    流式调用模型
    images: list of (file_storage, description) tuples
    """
    system_prompt = build_system_prompt()
    user_text = build_user_prompt(text_input, notes, image_descriptions)

    if USE_DASHSCOPE:
        yield from call_dashscope_stream(system_prompt, user_text, images)
    elif USE_OPENAI_COMPAT:
        yield from call_openai_stream(system_prompt, user_text, images)
    else:
        yield "错误：未配置模型调用方式，请检查 app.py 配置。"


def call_dashscope_stream(system_prompt, user_text, images):
    """通过 DashScope API 调用 qwen2.5-VL"""
    try:
        import dashscope
        from dashscope import MultiModalConversation

        dashscope.api_key = DASHSCOPE_API_KEY

        # 构建消息内容
        user_content = []

        # 添加图片
        for img_data, desc in images:
            b64 = encode_image_to_base64(img_data)
            mime = get_mime_type(img_data.filename)
            user_content.append({
                "image": f"data:{mime};base64,{b64}"
            })

        # 添加文本
        user_content.append({"text": user_text})

        messages = [
            {"role": "system", "content": [{"text": system_prompt}]},
            {"role": "user", "content": user_content}
        ]

        response = MultiModalConversation.call(
            model=MODEL_NAME,
            messages=messages,
            stream=True,
            incremental_output=True
        )

        for chunk in response:
            if chunk.status_code == 200:
                if chunk.output and chunk.output.choices:
                    content = chunk.output.choices[0].message.content
                    if isinstance(content, list):
                        for item in content:
                            if item.get('text'):
                                yield item['text']
                    elif isinstance(content, str):
                        yield content
            else:
                yield f"\n\n[错误] DashScope API 返回错误: {chunk.message}"
                break

    except Exception as e:
        yield f"\n\n[错误] 调用 DashScope API 失败: {str(e)}"


def call_openai_stream(system_prompt, user_text, images):
    """通过 OpenAI 兼容接口调用"""
    try:
        client = OpenAI(
            api_key=OPENAI_API_KEY,
            base_url=OPENAI_BASE_URL
        )

        # 构建消息内容
        user_content = []

        # 添加图片
        for img_data, desc in images:
            b64 = encode_image_to_base64(img_data)
            mime = get_mime_type(img_data.filename)
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime};base64,{b64}"
                }
            })

        # 添加文本
        user_content.append({
            "type": "text",
            "text": user_text
        })

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]

        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            stream=True,
            max_tokens=4096,
            temperature=0.7
        )

        for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    except Exception as e:
        yield f"\n\n[错误] 调用 OpenAI 兼容接口失败: {str(e)}"


# ============================================================
# 路由
# ============================================================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/solve', methods=['POST'])
def solve():
    """处理解题请求"""
    text_input = request.form.get('text_input', '')
    notes = request.form.get('notes', '')

    # 收集图片（最多3张）
    images = []
    image_descriptions = []

    img_types = [
        ('image_geometry', '平面几何图'),
        ('image_coordinate', '平面直角坐标系图'),
        ('image_3d', '立体图'),
    ]

    for field_name, type_desc in img_types:
        if field_name in request.files:
            file = request.files[field_name]
            if file and file.filename:
                images.append((file, type_desc))
                image_descriptions.append(f"{type_desc}（文件名: {file.filename}）")

    # 收集表格（最多2张）
    for i in range(1, 3):
        field_name = f'table_{i}'
        if field_name in request.files:
            file = request.files[field_name]
            if file and file.filename:
                images.append((file, f'表格{i}'))
                image_descriptions.append(f"表格{i}（文件名: {file.filename}）")

    if not text_input.strip() and not images:
        return jsonify({'error': '请至少输入题目内容或上传图片'}), 400

    return Response(
        call_model_stream(text_input, notes, images, image_descriptions),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    app.run(host='0.0.0.0', port=5001, debug=True)
