# 🏌️ GolfSum - Golf Score Tracking App

**Track your golf rounds with professional course data and detailed statistics.**

---

## 💼 Ops/Cost Executive Summary

- **Top paid/usage services:** Firebase, Golf Course API, RevenueCat, OCR backend (Gemini), Vercel (hosting + Postgres + Analytics), Expo EAS.
- **Likely largest cost drivers:** OCR volume, Firestore read/write volume, serverless/API traffic, subscription stack scale.
- **Low/no direct cost dependencies:** Open-Meteo weather/elevation, OpenStreetMap fallback discovery, Google/Apple OAuth.
- **Source of truth:** see `OPS_COST_INVENTORY.md` for env vars, code references, and ownership table.
- **Release QA checklist:** see `RELEASE_SMOKE_CHECKLIST.md` (TestFlight smoke pass before submission).

---

## ✨ Features

### 📊 Manual Score Entry
- **Fast +/- buttons** for quick score entry
- **Quick stats toggles** (FIR/GIR/Putts)
- **Hole-by-hole navigation** with progress tracking
- **Live round summary** with real-time calculations

### 🏌️ Professional Course Data
- **30,000 courses** from Golf Course API
- **GPS location** - Find nearby courses automatically 📍
- **Distance sorting** - See closest courses first
- **Multiple tee boxes** with pars and yardages
- **Hole-by-hole yardages** and pars
- **Course search** with autocomplete
- **Recent & favorite courses** for quick access

### 📈 Statistics & Analytics
- **GolfSum Player Rating** calculation (proprietary score-vs-par metric)
- **Scoring averages** (overall, last 5, last 10, last 20)
- **Stats tracking** (FIR%, GIR%, Putts/Round, Up/Down%)
- **Performance trends** over time
- **Best rounds** tracking

### 🎯 Round History
- **Detailed round view** with HTML scorecard
- **Edit rounds** after saving
- **Delete rounds** with confirmation
- **Filter & search** rounds
- **Export data** (coming soon)

### 👤 User Profile
- **Firebase authentication** (optional)
- **Cloud sync** across devices
- **Local storage** fallback
- **Profile settings** and preferences

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Get Your FREE API Key

1. Go to: https://rapidapi.com/apihood-apihood-default/api/golf-course-api
2. Sign up for a free account
3. Subscribe to the **Basic (FREE)** plan
4. Copy your **X-RapidAPI-Key**

### 3. Configure Environment

Create a `.env` file in the project root:

```bash
EXPO_PUBLIC_GOLF_COURSE_API_KEY=your-rapidapi-key-here
```

### 4. Start the App

```bash
npm start
```

Then:
- Press `w` for web
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on your phone

---

## 📱 How to Use

### Starting a New Round

1. **Tap "Start New Round"** on the Upload tab
2. **Find your course:**
   - **GPS:** Tap "Find Nearby Courses" 📍 (fastest at the course)
   - **Search:** Type course name (e.g., "Pebble Beach")
3. **Select your course** from the results
4. **Choose tee box** (automatically loaded from API)
5. **Enter scores** using +/- buttons as you play
6. **Toggle stats** (FIR/GIR/Putts) with one tap
7. **Save round** when complete

### Viewing Round History

1. **Tap "History"** tab
2. **Select a round** to view details
3. **View scorecard** in HTML format
4. **Edit or delete** rounds as needed

### Checking Statistics

1. **Tap "Averages"** tab for scoring stats
2. **Tap "Insights"** tab for detailed analytics
3. **View player rating** and trends
4. **Compare performance** across different time periods

---

## 🏗️ Tech Stack

- **React Native** (Expo)
- **TypeScript**
- **Firebase** (Auth + Firestore + Storage)
- **Golf Course API** (RapidAPI)
- **AsyncStorage** (local data)

---

## 📂 Project Structure

```
GolfSum/
├── App.tsx                          # Main app component
├── src/
│   ├── components/
│   │   ├── ApiKeyModal.tsx          # API key setup modal
│   │   ├── AveragesTab.tsx          # Scoring averages view
│   │   ├── BestsTab.tsx             # Best rounds view
│   │   ├── BottomNavigation.tsx     # Bottom tab navigation
│   │   ├── CellEditorModal.tsx      # Scorecard cell editor
│   │   ├── CourseSearchScreen.tsx   # Course search UI
│   │   ├── HistoryTab.tsx           # Round history view
│   │   ├── InsightsTab.tsx          # Analytics dashboard
│   │   ├── ManualScoreEntry.tsx     # Score entry screen
│   │   ├── ProfileTab.tsx           # User profile
│   │   ├── RoundDetailView.tsx      # Round details
│   │   └── ScorecardViewer.tsx      # HTML scorecard viewer
│   ├── services/
│   │   ├── analyticsService.ts      # Analytics calculations
│   │   ├── firebaseAuthService.ts   # Firebase auth
│   │   ├── correctionService.ts     # Score corrections
│   │   ├── firebase.ts              # Firebase config
│   │   ├── firestoreApi.ts          # Firestore API
│   │   ├── golfCourseApiService.ts  # Golf Course API
│   │   ├── learningService.ts       # Learning algorithms
│   │   ├── roundsService.ts         # Round management
│   │   ├── storage.ts               # Local storage
│   │   ├── storageService.ts        # Firebase storage
│   │   ├── userService.ts           # User data
│   │   └── weatherService.ts        # Weather data
│   ├── types/
│   │   └── index.ts                 # TypeScript types
│   └── utils/
│       └── (utilities)
├── .env                             # Environment variables
└── package.json                     # Dependencies
```

---

## 🔑 API Configuration

### Golf Course API (RapidAPI)

**FREE Tier:**
- 100 requests/day
- 15,000+ courses worldwide
- Professional data (yardages, pars, tee details)

**Typical Usage:**
- Course search: 1 request per search
- Course details: 1 request per course (cached 30 days)
- **Average: 2-3 requests per round**

**Cost for 2-3 rounds/week:**
- **FREE** (well under 100 requests/day)

---

## 🎨 UI/UX Features

### Design
- **Dark theme** optimized for outdoor use
- **Large touch targets** for easy mobile use
- **Minimal taps** for fastest entry
- **Real-time feedback** on all actions

### Accessibility
- **High contrast** colors
- **Clear typography** (system fonts)
- **Icon + text labels** for clarity
- **Confirmation dialogs** for destructive actions

---

## 📊 Statistics Explained

### GolfSum Player Rating
- Calculated from **adjusted score vs par**
- Uses best recent rounds with **early-rating rules** for low round counts
- Lower is better
- Round Rating: `(Adjusted Gross Score - Course Par)`

### Fairways in Regulation (FIR)
- **Par 4s and 5s only** (Par 3s excluded)
- Fairway hit if ball is on fairway after tee shot
- Displayed as: `Hit/Total` and percentage

### Greens in Regulation (GIR)
- Green hit in regulation if:
  - **Par 3**: On green in 1 shot
  - **Par 4**: On green in 2 shots
  - **Par 5**: On green in 3 shots
- Displayed as: `Hit/Total` and percentage

### Up & Down
- Successfully getting up and down when missing GIR
- **Made**: Got up and down (1 chip + 1 putt or better)
- **Attempts**: Total times missed GIR
- Displayed as: `Made/Attempts` and percentage

---

## 🐛 Troubleshooting

### "API key not set"
1. Create `.env` file in project root
2. Add `EXPO_PUBLIC_GOLF_COURSE_API_KEY=your-key`
3. Restart Expo dev server (`npm start`)

### "No courses found"
1. Check internet connection
2. Verify API key is correct
3. Try different search term (full course name)
4. Check RapidAPI dashboard for quota

### "Failed to load course data"
1. Verify API key is valid
2. Check you haven't exceeded 100 requests/day
3. Try clearing cache (Profile tab)
4. Check RapidAPI subscription is active

### App won't start
1. Clear cache: `npm start -- --clear`
2. Reinstall dependencies: `rm -rf node_modules && npm install`
3. Check Node.js version: `node -v` (should be 18+)

---

## 🔮 Roadmap

### Coming Soon
- [ ] **Apple Watch app** for live scoring
- [ ] **Course maps** with GPS tracking
- [ ] **Shot tracking** (club selection, distances)
- [ ] **Social features** (share rounds, compete)
- [ ] **Weather integration** (auto-fetch conditions)
- [ ] **Export data** (CSV, PDF scorecards)
- [ ] **Course reviews** and ratings
- [ ] **Tee time booking** integration

### Future Ideas
- [ ] **AI coach** (personalized tips)
- [ ] **Video analysis** (swing recording)
- [ ] **Tournament mode** (multi-player scoring)
- [ ] **Equipment tracking** (club performance)
- [ ] **Course recommendations** based on skill

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📄 License

MIT License - feel free to use this project for personal or commercial use.

---

## 🙏 Acknowledgments

- **Golf Course API** by APIhood (course data)
- **Expo** team (amazing framework)
- **Firebase** (backend services)
- **React Native** community

---

## 📧 Support

Questions? Issues? Suggestions?

- **GitHub Issues**: [Create an issue](https://github.com/yourusername/golfsum/issues)
- **Email**: support@golfsum.app (coming soon)

---

**Happy golfing! 🏌️⛳**

*Track your rounds. Analyze your game. Lower your scores.*
