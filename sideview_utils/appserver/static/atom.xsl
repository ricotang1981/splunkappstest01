<?xml version="1.0" encoding="UTF-8"?>
<!--  -->

<xsl:stylesheet version="1.0" 
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://dev.splunk.com/ns/rest"
  >



<xsl:strip-space elements="*" />
<xsl:output method="html" indent="no" doctype-system="http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd" doctype-public="-//W3C//DTD XHTML 1.0 Transitional//EN" />

<xsl:template match="/">
    <html>
      <head>
        <title><xsl:value-of select="//atom:title" /><xsl:text> - Splunk</xsl:text></title>
        <style>
* { 
  margin: 0; 
  padding: 0; 
}
body    { 
  font-family: Helvetica, Arial, sans-serif; 
}
h2,h3,p { 
  margin-bottom: .4em; 
}
h1      { 
  padding: 5px 10px; 
  background-color: #333; 
  color: #eee; 
  font-weight: normal; 
  font-size:1.3em;
}
h2      { font-size: 15px; font-weight: normal; }
li      { margin-left: 1.6em; padding: 2px 0; }

.feedmeta  { background: #f2f2f2; font-size: 12px; color: #333; padding: 5px; border-top: 1px solid #ccc; }
.feedlinks  { background: #f5f5f5; font-size: 12px; color: #333; padding: 5px; border-top: 1px solid #ccc; }
.entries  { padding: 10px; }
.entry    { padding: 10px 5px; }
.content  { font-size: 12px; padding: 3px 0; white-space:pre; }
.meta    { color: #777; }
.updated  { font-size: 11px; }
.author    { font-size: 11px; }

.links    { font-size: 12px; padding: 4px 0; }
.links form { display: inline; }
.links form *   { margin: 2px; }
input,select    { border: 1px solid #999; font-size: 11px; }

table.dict {
  border-spacing:0px;
  border-collapse:collapse;
}
.dict td  { 
  border-top: 1px solid #eee; 
  border-bottom: 1px solid #eee; 
  padding: 4px; 
}
.dict td.key  { 
  font-weight: bold; 
  vertical-align:top;
}
.dict tr.alternatingRowColor {
  background-color:#f5f5f5;
}
.dict tr tr.alternatingRowColor {
  background-color:#fff;
}

#reqdargs {
  text-align: left;
  margin-left:20px;
  border-style: solid;
  border-width: 1px 1px 1px 1px; 
  border-spacing : 20px 
}

        </style>
      </head>
      <body>


      

          <xsl:for-each select="atom:feed|atom:entry">
            <h1>
              <xsl:text>Splunk Atom Feed: </xsl:text>
              <xsl:value-of select="atom:title" />
            </h1>
            <div class="feedmeta">
              <strong>Updated: </strong><xsl:value-of select="atom:updated" />
              <xsl:text> | </xsl:text>
              <strong>Splunk build: </strong><xsl:value-of select="atom:generator/@version" />

              <xsl:if test="name() = 'feed' and atom:link">
                <xsl:text> | </xsl:text>
                  <span class="feedlinks">
                      <xsl:text>Feed links: </xsl:text>
                      <xsl:apply-templates select="atom:link" />
                  </span>
              </xsl:if>
            </div>

            <xsl:choose>
              <xsl:when test="//s:key/@name='eai:attributes'">
                <xsl:call-template name="editForm">
                   <xsl:with-param name="entry" select="atom:entry"/>
                </xsl:call-template>
              </xsl:when>
              <xsl:otherwise>
                <div class="entries">
                    <xsl:if test="name() = 'atom:entry/atom:content/s:dict'">
                      <xsl:apply-templates select="." />
                  </xsl:if>
                  <xsl:apply-templates select="atom:entry" />
                </div>
              </xsl:otherwise>
            </xsl:choose>
            
            
          </xsl:for-each>
      </body>
  </html>
</xsl:template>


<xsl:template name="editForm">
  <xsl:param name="entry"/>
  <h2>Editing the thing</h2>

  

  <form method="POST">
    <xsl:attribute name="action">
      <xsl:value-of select="//atom:entry/atom:link[@rel='edit']/@href" />
    </xsl:attribute>
    <table class="editTable">
  
      <xsl:for-each select="$entry/atom:content/s:dict/s:key">
        <xsl:variable name="keyName" select="@name" />

        <xsl:choose>
          <xsl:when test="$keyName='_rcvbuf'"></xsl:when>
          <xsl:when test="starts-with($keyName,'eai:')"></xsl:when>
          <xsl:when test="starts-with($keyName,'evt_')"></xsl:when>
          <xsl:otherwise>

            <tr>
              <td style="text-align:right;">
                <label><xsl:value-of select="./@name" /></label>
                <xsl:choose>
                  <xsl:when test="//s:key[@name='optionalFields']/s:list/s:item[.=$keyName]"> (not required)</xsl:when>
                  <xsl:otherwise></xsl:otherwise>
                </xsl:choose>
              </td>

              <td><input type="text">
                  <xsl:attribute name="name"><xsl:value-of select="./@name"/></xsl:attribute>
                  <xsl:attribute name="value"><xsl:value-of select="."/></xsl:attribute>
                </input>
              </td>
            </tr>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:for-each>
      <tr>
        <td colspan="2">
          <input type="submit" label="Submit" />
        </td>
      </tr>
    </table>
  </form>
</xsl:template>


<xsl:template match="atom:entry">
  <div class="entry">
    <h2>
      <a href="{atom:link[@rel='alternate']/@href}">
        <xsl:value-of select="atom:title" />
      </a>
    </h2>
    <xsl:apply-templates select="atom:summary" />
                <xsl:apply-templates select="atom:use_cases" />
                <xsl:apply-templates select="atom:notes" />
                <xsl:apply-templates select="atom:side_effects" />
                <xsl:apply-templates select="atom:required_args" />
                <xsl:apply-templates select="atom:optional_args" />
                <xsl:apply-templates select="atom:success_status_code" />
                <xsl:apply-templates select="atom:example" />
    <div class="links">
      <xsl:apply-templates select="atom:link[@rel != 'alternate']" />
    </div>
    <p class="meta">
      Updated: <xsl:apply-templates select="atom:updated" />
      | Author: <xsl:apply-templates select="atom:author" />
    </p>
    <div class="content">
      <xsl:apply-templates select="atom:content" />
    </div>
    
  </div>
</xsl:template>

<xsl:template match="atom:content[@type='text/xml']">
  <xsl:apply-templates />
</xsl:template>

<xsl:template match="atom:content">
  <xsl:value-of select="." />
</xsl:template>

<xsl:template match="atom:summary">
  <p class="summary"><xsl:value-of select="." /></p>
</xsl:template>

<xsl:template match="atom:notes">
        <h3>Notes:</h3> 
        <ul>
            <xsl:for-each select="atom:note">
                <li><xsl:value-of select="." /></li>
            </xsl:for-each>
        </ul>
</xsl:template>

<xsl:template match="atom:use_cases">
        <h3>Use Cases:</h3>           
        <ul>
            <xsl:for-each select="atom:use_case">
                <li><xsl:value-of select="." /></li>
            </xsl:for-each>
         </ul>
</xsl:template>

<xsl:template match="atom:side_effects">
        <h3>Side Effects:</h3>
        <ul>
            <xsl:for-each select="atom:side_effect">
                <li><xsl:value-of select="." /></li>
            </xsl:for-each>
         </ul>
</xsl:template>

<xsl:template match="atom:required_args">
        <h3>Required Args:</h3>
        <br/>
        <table id="reqdargs">
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Validations</th>
                </tr>

                <xsl:for-each select="atom:arg">
        <tr>    
                        <td><xsl:value-of select="atom:name" /></td>
                        <td><xsl:value-of select="atom:type" /></td>
                        <td><xsl:value-of select="atom:description" /></td>
                        <td><xsl:value-of select="atom:validation" /></td>
                    </tr>
                </xsl:for-each>
        </table>
</xsl:template>

<xsl:template match="atom:optional_args">
        <h3>Optional Args:</h3>
        <br/>
        <table id="reqdargs">
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Validations</th>
                </tr>

                <xsl:for-each select="atom:arg">
                    <tr>
                        <td><xsl:value-of select="atom:name" /></td>
                        <td><xsl:value-of select="atom:type" /></td>
                        <td><xsl:value-of select="atom:description" /></td>
                        <td><xsl:value-of select="atom:validation" /></td>
                    </tr>
                </xsl:for-each>
        </table>
</xsl:template>

<xsl:template match="atom:success_status_code">
        <h3>Success Status Code:</h3>
        <p><xsl:value-of select="." /></p>
</xsl:template>

<xsl:template match="atom:example">
        <h3>Example:</h3>
        <p><xsl:value-of select="." /></p>
</xsl:template>

<xsl:template match="atom:link[@rel='control' and contains(@href, 'jobs')]">
    <form method="POST" action="{@href}">
        <label for="controlPoint{position()}">control:</label>
        <select id="controlPoint{position()}" name="action">
            <option>pause</option>
            <option>unpause</option>
            <option>finalize</option>
            <option>cancel</option>
            <option>touch</option>
        </select>
        <input type="submit" value="Submit" />
    </form>
</xsl:template>

<xsl:template match="atom:link">
  <a>
      <xsl:attribute name="href">
          <xsl:value-of select="@href" />
          <xsl:if test="@rel = 'events' or @rel = 'results'">
              <xsl:text>?count=5</xsl:text>
          </xsl:if>
          <xsl:if test="@rel = 'edit'">
              <xsl:text>?action=</xsl:text><xsl:value-of select="@rel" />
          </xsl:if>
          
      </xsl:attribute>
      <xsl:value-of select="@rel" /></a>
  <xsl:text> - </xsl:text>
</xsl:template>

<xsl:template match="atom:updated">
  <span class="updated"><xsl:value-of select="." /></span>
</xsl:template>

<xsl:template match="atom:author">
  <span class="author">
    <xsl:text> | </xsl:text>
    <a href="/services/auth/user/{atom:name}"><xsl:value-of select="atom:name" /></a>
  </span>
</xsl:template>

<xsl:template match="s:dict">
  <table class="dict">
    <xsl:for-each select="s:key">
      <xsl:sort select="@name" />
      <tr>
        <xsl:if test="position() mod 2">
          <xsl:attribute name="class">alternatingRowColor</xsl:attribute>
        </xsl:if>
        <td class="key">
          <xsl:value-of select="@name" />
        </td>
        <td>
          <xsl:apply-templates />
        </td>
      </tr>
    </xsl:for-each>
  </table>
</xsl:template>

<xsl:template match="s:list">
  <ol class="list">
    <xsl:for-each select="s:item">
      <li>
        <xsl:apply-templates />
      </li>
    </xsl:for-each>
  </ol>
</xsl:template>


</xsl:stylesheet>
