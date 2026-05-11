# AI Learning Assistant Telegram Bot

## Overview

This project is an AI-powered personal learning assistant built with n8n and delivered through Telegram.

The bot can:
- summarize learning materials from URLs
- save submitted materials
- generate quizzes from saved topics
- check quiz answers
- calculate a score
- provide explanations for incorrect answers

## Bot commands

### /start

Shows a welcome message and available commands.

### /learn [url]

Fetches content from a submitted URL, summarizes it using the Teacher AI role, and saves the material.

Example:

```bash
/learn https://react.dev/reference/react/useState