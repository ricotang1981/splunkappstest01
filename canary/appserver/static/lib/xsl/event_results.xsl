<?xml version="1.0" encoding="UTF-8"?>
<!--  -->

<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:strip-space elements="*" />
<xsl:preserve-space elements="v" />
<xsl:output method="html" indent="no" doctype-system="http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd" doctype-public="-//W3C//DTD XHTML 1.0 Transitional//EN" />

<xsl:template match="/">
  <ol>
    <xsl:apply-templates select="results/result"/>
  </ol>
</xsl:template>

<xsl:template match="result">
  <li class="event">
    <div class="timestamp"><xsl:attribute name="epochtime"><xsl:value-of select="field[@k='_time']"/></xsl:attribute>
      <xsl:apply-templates select="field[@k='time']"/>
    </div>
    <div>
      <pre>
        <xsl:apply-templates select="field[@k='_raw']"/>
      </pre>
      <div class="fields">
        <xsl:apply-templates select="field[@k!='_time' and @k!='_raw' ]"/>
      </div>
    </div>
  </li>
  <br/>
</xsl:template>


<xsl:template match="field[@k='_time']">
  <xsl:value-of select="value/text" />
</xsl:template>

<xsl:template match="field[@k='_raw']">
  <xsl:apply-templates select="v" />
</xsl:template>

<xsl:template match="field[@k!='_time' and @k!='_raw']">
    <span class="field">
    <span class="key"><xsl:value-of select="@k" /></span>
    <xsl:text>=</xsl:text>
    <xsl:for-each select="value">
      <span termkey="{../@k}" term="{.}">
        <xsl:attribute name="class">
          <xsl:text>value</xsl:text>
          <xsl:if test="./@h='1'">
            <xsl:text> highlight</xsl:text>
          </xsl:if>
        </xsl:attribute>
        <xsl:apply-templates select="text"/>
      </span>  
      <xsl:text> </xsl:text>
      <xsl:for-each select="tag">
        <em><span termkey="tag::{../../@k}" term="{.}">
          <xsl:attribute name="class">
            <xsl:text>value</xsl:text>
          </xsl:attribute>
          <xsl:apply-templates/>
        </span></em>
      </xsl:for-each>
    </xsl:for-each>
    <xsl:if test="position() != last()">
      <xsl:text>&#160;|&#160;</xsl:text>
    </xsl:if>
  </span>
</xsl:template> 


<xsl:template match="v">
  <xsl:apply-templates />
</xsl:template>

<xsl:template match="sg">
  <span>
    <xsl:attribute name="class">
      <xsl:text>term</xsl:text>
      <xsl:if test="@h">
        <xsl:text> searchTermHighlight</xsl:text>
      </xsl:if>
    </xsl:attribute>
    <xsl:apply-templates />
  </span>
</xsl:template>

</xsl:stylesheet>