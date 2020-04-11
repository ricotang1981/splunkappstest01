
#These two stanzas are part of a convention we use in Sideview apps,  where a
# checklist.conf stanza can check whether:
# 1) the current Splunk version matches the required Splunk version we ship
# in the dependency:splunk key in app.conf
# 2a) whether the current Sideview Utils versions matches the required version
# we specify in the dependency;app:sideview_utils key in app.conf
# 2b) OR whether the current Canary version matches the required version we
# specify in the dependency;app:canary key

[dependency:splunk]
requiredVersion = <version string>

[dependency:app:<appname>]
requiredVersion = <version string>
