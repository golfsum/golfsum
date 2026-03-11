# Firebase GPS Course Function

Callable function name: `getCourseHoles`

```js
// functions/index.js (Firebase Functions backend)
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.getCourseHoles = functions.https.onCall(async (data) => {
  const courseId = String(data?.courseId || '').trim();
  if (!courseId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing courseId');
  }

  const cacheRef = db.collection('courseCache').doc(courseId);
  const cached = await cacheRef.get();
  if (cached.exists) {
    return cached.data();
  }

  // Replace with your Golf API call + normalization
  const normalized = await fetchGolfApiAndNormalize(courseId);
  if (!normalized) {
    return { error: 'not_found' };
  }

  await cacheRef.set({
    ...normalized,
    cachedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return normalized;
});
```

Firestore layout:

```text
courseCache/{courseId}
  courseId
  courseName
  holes: [...]
  cachedAt
```

