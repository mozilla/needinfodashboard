A handy Bugzilla need info flag dashboard that supports displaying summary NI counts categorized
by developer / release management setters. The main pane provides NI counts linked to both Bugzilla bug
lists as well as develop specific sub pages. Sub pages provide lists of individual NIs matched to
the Bugzilla comment when the NI was set, as well as additional meta data such as bug title, severity,
priority, and assignee. A basic set of bulk action options are also provided for authenticated users.

Improvements and bug fixes are welcome. If you would like to add an additional team to this instance
submit a new team specific json config file with an updated 'developers' entry and update the
'team-select' select in the index file. See js/media.json for an example of the json format.

Originally based on Bob Hood's Need Info Leaderboard.