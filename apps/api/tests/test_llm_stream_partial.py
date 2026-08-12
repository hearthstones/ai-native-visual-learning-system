"""Unit tests for streaming JSON assistant_message extraction."""

from app.services.llm import extract_assistant_message_partial


def test_extract_assistant_message_partial_incomplete():
    buf = '{"assistant_message":"你好，正在生成'
    assert extract_assistant_message_partial(buf) == "你好，正在生成"


def test_extract_assistant_message_partial_complete_before_live_doc():
    buf = '{"assistant_message":"已生成初稿，请看右侧。","live_doc":{"levels":[]}}'
    assert extract_assistant_message_partial(buf) == "已生成初稿，请看右侧。"


def test_extract_assistant_message_partial_escapes():
    buf = '{"assistant_message":"第一行\\n第二行"}'
    assert extract_assistant_message_partial(buf) == "第一行\n第二行"


def test_extract_assistant_message_partial_not_started():
    assert extract_assistant_message_partial('{"live_doc":{') is None
    assert extract_assistant_message_partial('{"assistant_message":') is None
