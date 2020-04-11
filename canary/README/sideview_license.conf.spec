############################################################################
# OVERVIEW
############################################################################
# this defines the configuration file format for Sideview's proprietary 
# license-enforcement mechanism used for its commercial apps. 
#
# These encoded strings may represent either a trial license, or a full 
# license, and at the same time may represent a perpetual license or a term 
# license.  Typically Sideview apps also provide a user interface where 
# admins can paste in their license string, which would push the license 
# string here.  There is also typically a custom REST endpoint defined that
# returns the license information for the currently loaded license.
#
# However admins can also deploy license directly via these files.

# there can only be one license loaded per app. 
# the stanza names are the app ids and not the readable english names.
[<appname>]

license = <string>
