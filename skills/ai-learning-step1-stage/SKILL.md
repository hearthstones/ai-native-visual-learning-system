---
name: "ai-learning-step1-stage"
description: "把主题拆成五个难度台阶，每级配里程碑、练习和自检题，让你始终清楚自己站在哪一步。"
---

# [1] 十倍速AI学习系统 - 学习阶梯

## 用法
当用户想按台阶式路径系统学习某个主题时，调用此技能。该技能将主题拆解为 5 个明确难度级别，帮助用户清楚自己处在哪一步、下一步是什么。

## 提示语
将以下提示语中的 `[topic]` 替换为用户想学习的主题，直接发送给 Claude：

```
I want to learn [topic] step by step, without skipping important foundations.

Act like an expert teacher and skill coach. Break [topic] into 5 clear difficulty levels, from complete beginner to confident practitioner.

For each level, include:

1. Level name
2. What I should understand at this stage
3. What mastery looks like at this level
4. The most important concepts or skills to focus on
5. One milestone that proves I am ready to move forward
6. One hands-on exercise or mini-project
7. Common mistakes learners make at this level
8. A simple self-check question before moving to the next level

Structure the levels like this:
- Level 1: Complete Beginner
- Level 2: Basic Understanding
- Level 3: Practical User
- Level 4: Problem Solver
- Level 5: Confident Practitioner

Keep the explanation practical, beginner-friendly, and focused on real progress.
```
