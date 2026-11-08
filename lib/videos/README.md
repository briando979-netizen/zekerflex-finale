# Video Management System

Complete video management and showcase system for ZekerFlex tutorials and guides.

## Features

- **Professional video player** with quality selection (360p, 720p, 1080p, 4K)
- **Real video hosting** - Vimeo, YouTube, self-hosted HLS/DASH streams
- **No AI/generated content** - only authentic videos with real people
- **Analytics** - views, watch time, engagement tracking
- **Role-based filtering** - content for employers, workers, admins
- **Mobile-optimized** - responsive design with touch controls
- **Accessibility** - keyboard shortcuts, captions support

## Adding Videos

### Via Admin Dashboard

1. Go to `/admin/videos`
2. Click "Neue Video" button
3. Fill in the form:
   - **Titel**: Video title
   - **Beschrijving**: Full description
   - **Kategorie**: tutorial, walkthrough, guide, story, or FAQ
   - **Rolle**: general, employer, worker, or admin
   - **Dauer**: Duration in seconds
   - **Thumbnail URL**: Image preview URL
   - **Hosting**: Vimeo, YouTube, or self-hosted
   - **Host ID**: Video ID from the hosting service
   - **Qualitäten**: Available quality options

### Vimeo Setup

1. Upload video to Vimeo (vimeo.com)
2. Get the video ID from the URL: `https://vimeo.com/{ID}`
3. Make the video embeddable in admin settings
4. Use in form as `hostId`

### YouTube Setup

1. Upload video to YouTube
2. Get the video ID from the URL: `https://www.youtube.com/watch?v={ID}`
3. Make the video public or unlisted
4. Use in form as `hostId`

### Self-Hosted Setup

1. Generate HLS/DASH manifest files
2. Upload video files and manifests to `/media/videos/{ID}/`
3. Create quality-specific manifests: `360p.m3u8`, `720p.m3u8`, etc.
4. Use `{ID}` as `hostId`

## Video Structure

Each video has:
- **Metadata**: title, description, duration, thumbnail
- **Hosting**: provider + ID
- **Content**: real video with authentic people
- **Analytics**: views and watch time tracking
- **Organization**: category + role + optional playlist

## API Endpoints

### List Videos
```
GET /api/admin/videos?category=tutorial&role=employer
```

### Create Video
```
POST /api/admin/videos
{
  "title": "Getting Started with ZekerFlex",
  "description": "Learn the basics...",
  "category": "tutorial",
  "role": "employer",
  "durationSeconds": 300,
  "thumbnailUrl": "...",
  "hostedOn": "vimeo",
  "hostId": "123456789",
  "qualities": ["720p", "1080p"]
}
```

### Get Video Details
```
GET /api/videos/{id}
```

### Track View
```
POST /api/videos/analytics
{
  "videoId": "{id}",
  "watchedSeconds": 180
}
```

### Get Analytics
```
GET /api/videos/analytics
```
Returns popular and most-watched videos.

## Gallery Pages

- `/tutorials` - All tutorials organized by role
- `/tutorials/{id}` - Individual video player with stats

## Video Player Controls

- **Space**: Play/pause
- **F**: Toggle fullscreen
- **M**: Toggle mute
- **← →**: Jump ±5 seconds
- **Quality selector**: Switch between 360p-4K
- **Speed selector**: 0.5x - 2x playback speed

## Best Practices

1. **Real People Only**: Use authentic videos with real humans, not AI/generated content
2. **High Quality**: Aim for 1080p minimum for clarity
3. **Short & Focused**: 3-5 min per feature, 10-15 min for comprehensive guides
4. **Captions**: Add subtitles for accessibility
5. **Professional Hosting**: Prefer Vimeo for professional look, YouTube for reach
6. **Consistent Branding**: Use same intro/outro, colors, fonts
7. **Testing**: Always test playback on mobile before publishing

## Example Videos to Create

### For Employers
- Platform overview (5-10 min)
- Posting a job/shift (3 min)
- Managing team (5 min)
- Payment & invoicing (5 min)

### For Workers
- Sign up & onboarding (3 min)
- Finding shifts (5 min)
- Time tracking (3 min)
- Payments & payouts (5 min)

### For All
- FAQ responses (2-3 min each)
- Success stories (5-10 min)
- Feature walkthroughs (3-5 min)

## Implementation Notes

- Videos are stored in Prisma with full metadata
- Analytics auto-tracked on view completion
- No watermarks or platform logos (clean content)
- Keyboard accessible player
- Responsive design: 320px - 1920px
- Dark mode support

## Monitoring

Check video performance in Admin → Videos:
- View counts trending
- Watch time metrics
- Drop-off analysis
- Engagement by role/category
