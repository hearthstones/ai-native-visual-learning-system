---
name: "ai-learning-step2-resource"
description: "从海量资源里筛出高杠杆资源（默认约 5 个，数量可按用户要求调整），标注难度、用法和避坑点，并给出精简路径，拒绝信息噪音。"
---

# [2] 十倍速AI学习系统 - 资料筛选

## 用法
当用户想快速学习某个主题，但不想在海量资源中浪费时间时，调用此技能。该技能从海量资源中筛选出最高杠杆资源（默认约 5 个；若用户明确要求更多或更少，严格按用户数量），标注难度、用法和避坑点，并给出精简学习路径。

## 提示语
将以下提示语中的 `[topic]` 替换为用户想学习的主题；将 `[count]` 替换为用户要求的数量（未指定时用 5），直接发送给 Claude：

```
I want to learn [topic] fast, but I do not want to waste time on low-quality resources.

Act like an expert learning curator. Find the [count] highest-leverage resources for learning [topic].
If the user later asks for a different count, regenerate the list to match that exact count — do not stay stuck at 5.

The resources can include books, videos, courses, websites, newsletters, communities, or experts to follow.

For each resource, include:

1. Resource name
2. Type of resource
3. Why it is worth my time
4. What specific part of [topic] it helps me learn
5. Best learner type for this resource
6. Difficulty level: beginner, intermediate, or advanced
7. How I should use it effectively
8. One warning about what not to waste time on

After the list, rank the resources in the best order to use them.

Then give me a simple short learning path using only these resources (about 7 days by default, adjust if the user asks).

Focus on quality, clarity, and practical usefulness. I want the signal, not the noise.
```
