# Merge Knowledge Folders

Merge two bots' `knowledge` folders into a new folder:

```powershell
npm run merge-knowledge -- C:\bot-1\knowledge C:\bot-2\knowledge C:\merged-knowledge
```

The source folders are never modified. The output folder must be empty and must
not be inside either source folder.

The merge combines learned counters, scores, notes, observations, recipes and
item categories. Configuration such as rules and strategies is taken from the
source file with the newest `updatedAt` timestamp.

Stop both bots before merging. After checking the merged files, replace the
target bot's `knowledge` folder while that bot is stopped.
