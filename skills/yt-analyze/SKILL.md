---
name: yt-analyze
description: Analyzes YouTube videos by fetching transcripts and providing summaries, insights, and answering questions about video content. Use when user asks to analyze, summarize, or understand YouTube videos.
compatibility: Requires ktools
---

# YouTube Video Analyzer

Analyzes YouTube videos by fetching chapters and transcripts to provide structured summaries and insights.

## When to Use

- User asks to analyze, summarize, or understand a YouTube video
- User has questions about video content
- User wants key points or transcript analysis without watching

## Workflow

### 1. Extract Video ID

From URL formats:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/watch?v=VIDEO_ID&other=params`

Extract the VIDEO_ID (11 characters, alphanumeric with `-` and `_`).

### 2. Check Availability

```bash
# List available transcripts
ktools yt-transcript list <video_id>

# Check for chapters
ktools yt-transcript chapters <video_id>
```

**If no transcripts available:**
- Inform user: "No transcript available for this video (may be private, age-restricted, or disabled)"
- Cannot proceed with analysis

**If chapters available:**
- Note chapter structure for better navigation and summaries

### 3. Fetch Transcript

```bash
# Create workspace
mkdir -p ~/.tools/scratch

# Download transcript (check if already exists first)
ktools yt-transcript get <video_id> --output ~/.tools/scratch/yt-<video_id>.txt
```

### 4. Analyze Content

**Read the transcript:**
```bash
Read: ~/.tools/scratch/yt-<video_id>.txt
```

**Provide analysis based on user's request:**

**For summaries:**
- Brief overview (2-3 sentences)
- Main topics covered (reference chapters if available)
- Key takeaways (3-5 bullets with timestamps)

**For questions:**
- Direct answer with timestamp references `[HH:MM:SS]`
- Relevant quotes from transcript
- Context from surrounding content

**For detailed analysis:**
- Chapter-by-chapter breakdown (if chapters available)
- Important concepts and themes
- Key insights with timestamp citations

### 5. Navigate Long Videos

**If video has many chapters or is very long:**
- Show chapter list with time ranges
- Offer options: "This is a ~X hour video with Y chapters. I can:"
  - Provide a high-level overview
  - Focus on specific chapters
  - Search for specific topics

**Extract specific chapters:**
```bash
# Example: Extract content from 1:38:00 to 2:00:00
grep "^\[1:38:" ~/.tools/scratch/yt-<video_id>.txt | head -n 100
grep "^\[1:[3-5][0-9]:" ~/.tools/scratch/yt-<video_id>.txt
```

**Search for topics:**
```bash
grep -i "topic keyword" ~/.tools/scratch/yt-<video_id>.txt
```

## Example Usage

```
User: "Analyze https://www.youtube.com/watch?v=dQw4w9WgXcQ"

1. Extract video ID: dQw4w9WgXcQ
2. Check chapters: ktools yt-transcript chapters dQw4w9WgXcQ
3. Fetch: ktools yt-transcript get dQw4w9WgXcQ --output ~/.tools/scratch/yt-dQw4w9WgXcQ.txt
4. Read transcript and provide summary with key timestamps
```

## Tips

- **Timestamps:** Transcripts include `[MM:SS]` or `[HH:MM:SS]` format - always cite them
- **Chapters:** Use chapter structure to organize summaries and navigate content
- **Long videos:** Offer to focus on specific sections or chapters
- **Cache:** Check if transcript already exists before re-downloading
- **Limitations:** Only analyzes spoken content (no visual/on-screen text analysis)

## Common Patterns

**Find when a topic is discussed:**
```bash
grep -i "topic" ~/.tools/scratch/yt-<video_id>.txt
```

**Extract a time range:**
```bash
# Get content between 1:30:00 and 2:00:00
grep "^\[1:[3-5][0-9]:" ~/.tools/scratch/yt-<video_id>.txt
```

**Show chapter structure:**
```bash
ktools yt-transcript chapters <video_id>
```
