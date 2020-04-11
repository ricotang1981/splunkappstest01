#Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

import logging
import cherrypy
import splunk.appserver.mrsparkle.controllers as controllers
from splunk.appserver.mrsparkle.lib.decorators import expose_page
import splunk.entity
from random import choice

logger = logging.getLogger('splunk.appserver.controllers.refresh')


# URL: /custom/sideview_utils/freshmaker/refresh
class freshmaker(controllers.BaseController):

    @expose_page(must_login=True, methods=['GET'])
    def refresh(self, entityPath=None, **kwargs):

        try:
            splunk.entity.refreshEntities(entityPath, namespace='search')
            message = "OK we just told Splunkd to refresh " + entityPath + " from disk"

        except Exception as e:
            logger.exception(e)
            if hasattr(e, 'extendedMessages') and e.extendedMessages:
                errorMessage = e.extendedMessages[0]['text']
            else:
                errorMessage = e
            message = "Error occurred refreshing " + entityPath + " " + e.__class__.__name__ + " " + unicode(errorMessage)

        return self.render_template("/sideview_utils:/templates/freshmaker.html", {
            "message": "".join(message),
            "amrit": self.getAmrit()
        })

    def getAmrit(self):
        fishies = ["""
      _///_
     /o    \\/
     > ))_./\\
        <
        """, """
         /  ;
     _.--\"\"\"-..   _.
    /F         `-'  [
   ]  ,    ,    ,    ;
    '--L__J_.-"" ',_;
        '-._J
        """, """
 .-=-.  ,
(     ><
 `-=-'  `
        """, """

    _.-=-._     .-,
 .'       "-.,' /
(          _.  <
 `=.____.="  `._\\
        """, """
       .   )\\
       \\`.-' `-oo
        ) _  __,0)
       /.' )/
       '
        """, """

    O           ,
             .</       ,
          ,aT&/t    ,</
     o   o:\\:::::95/b/
      ' >::7:::::U2\\P\\
          '*qf\\P    '<\\
             '<\\       '
                '""", """
                    _,;_;/-",_
                 ,")  (  ((O) "  .`,
               ,` (    )  ;  -.,/;`}
             ,"  o    (  ( (  . -_-.
            `.  ;      ;  ) ) \\`; \\;
              `., )   (  ( _-`   \\,'
                 "`'-,,`.jb""","""


       .. .,$DDNNMNNNDD8ND+.
       ..7NNNNMMMMMMMMMMMMMND?.
.      MMMMMMMMMMMMMMMMMMMMMMMM8,
..  .ZMNMDNNNDNNNMMMMMMMMMMMMMMMMD
...8MMMMMMMMMNDMMNDDDODNMMMMMMMMMMMM...
. DMMMNNN8$7777ZO7I???7$Z8NNMMMMMMMMI
.DMMMDZ$$7IIII?++++?III77$7Z8NMMMMMMN..
7MNMNZ$$77?I?++=====??I7I$$ZODMMMMMMN..
DDMMNZ$$7???+==~:::~=+?II77$8NMMMMMMM..
NMMMN$7I?+===~::,,,,:~+??I7$Z8DNMMMMM~..
MMMN8I??++=~~:::,,,,,:=++?I7$ZDNMMMMMD..
MMM8$I7I+=~:::,,,,,,:====+?II$8DNNMMMM:.
MMNZ$NNN87~:::,,,,,,~?II7?=+?7ZDMMMMMM8.
MMO87~~=IZ7+,,,....:Z8ZI=+7Z$7I$DNMMMM8.
ZM$$====~==?~,,..,~++=:,,::~I7?78NMNNO+.
7D7?++I?+=~==:,,,~=~~=~====~=I?78NM$I?I.
777?$O~,D8+?+I~:~?+?+=8D~87?++?IZN8?7I~.
~?7+?$~:8Z,==?=:+I++,,$8:IO7=~?I$8$==7~=
.7I=+?+==~~~~?~:+?=~+=~=+===~:+I7ZI~~?I.
.7?=~:=+++:~?+::~?=~:::~~::::~+77Z7?==$.
+??=::,:::=??~::~??+:,,,,,,:~~+7$ZI~~I:.
+II=:,,:::+?+~::~+++~:,,,,,:~=?7$$=~~+,.
III~:::::~?+~:,:~=+I~:,,,,,:~??7ZZ~~+...
 7?=::~++~?=:,.,~=~?~==~,,:~+?IIZ.......
 .+=~=+=+=++:,,:=+?+~~~==~=+++II8 ......
 .===:~+77OOO+=$OOZ$7$$I=+=+==I$,.......
  ,==:~~+I==???==+++??II=~=+++IO........
  .:==:=:==.........:==~~~+?+?Z.........
  ..~+===~II?:...,=?I+~~=+?+?I:.........
 ...==?===?I==,,:~=I+~~++I??I$..........
  ..,?++=+~=?=:::+?===~=+?III...........
  ...I??+I+=?Z$I7I+===~?II7:............
  ....7I?ZII?+==~~~=~+I7I$..............
  .....$I$$7I+~=~~~=?$777...............
  ......=7O8ZZOZ$$ZOZ$7.................
  ........~I$OD88ZZ$7...................
  .......... :+++:......................
  """
                ]
        return choice(fishies)
