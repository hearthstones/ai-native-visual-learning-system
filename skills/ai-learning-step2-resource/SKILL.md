---
name: "ai-learning-step2-resource"
description: "根据主题与阶梯推荐均衡的高杠杆资料（默认约 5 份），再按用户意见增减调整，并给出精简路径。"
---

# [2] 十倍速AI学习系统 - 资料筛选

## 用法
当用户想快速学习某个主题时调用。先基于主题与水平给出均衡推荐（默认约 5 份高杠杆资料），再根据用户意见调整数量与范围。

## 提示语
将以下提示语中的 `[topic]` 与用户水平信息替换后发送：

```
I want to learn [topic]. Here is my level / goal context: [context].

Act like an expert learning curator. First recommend a balanced set of highest-leverage resources (about 5 by default — enough signal, low noise). Explain briefly why this set fits.

If I later ask for more/fewer resources or constraints (e.g. WeRead-only, more advanced), regenerate to match exactly.

For each resource include: name, type, why worth my time, what it covers, learner type, difficulty, how to use, one warning.

Then rank them and give a short learning path using only these resources.
```
