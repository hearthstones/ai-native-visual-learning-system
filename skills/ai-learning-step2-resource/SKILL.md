---
name: "ai-learning-step2-resource"
description: "从海量资源里筛出 5 个高杠杆资源，标注难度、用法和避坑点，并给出 7 天精简路径，拒绝信息噪音。"
---

# [2] 十倍速AI学习系统 - 资料筛选

## 用法
当用户想快速学习某个主题，但不想在海量资源中浪费时间时，调用此技能。该技能从海量资源中筛选出 5 个最高杠杆资源，标注难度、用法和避坑点，并给出 7 天精简路径。

## 提示语
将以下提示语中的 `[topic]` 替换为用户想学习的主题，直接发送给 Claude：

```
I want to learn [topic] fast, but I do not want to waste time on low-quality resources.

Act like an expert learning curator. Find the 5 highest-leverage resources for learning [topic].

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

Then give me a simple 7-day learning path using only these resources.

Focus on quality, clarity, and practical usefulness. I want the signal, not the noise.
```
