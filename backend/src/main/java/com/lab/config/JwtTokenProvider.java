package com.lab.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import java.security.Key;
import java.util.Date;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtTokenProvider {
    private final Key key;
    private final long expiration;

    public JwtTokenProvider(@Value("${jwt.secret}") String secret, @Value("${jwt.expiration:86400000}") long expiration) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes());
        this.expiration = expiration;
    }

    /**
     * 生成 JWT Token（包含 userId, email, role, tenantId）
     */
    public String generateToken(Long userId, String email, String role, Long tenantId) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + this.expiration);
        var builder = Jwts.builder()
                .setSubject(String.valueOf(userId))
                .claim("email", email)
                .claim("role", role)
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(this.key, SignatureAlgorithm.HS256);
        if (tenantId != null) {
            builder.claim("tenantId", tenantId);
        }
        return builder.compact();
    }

    /**
     * 向后兼容：3参数版本
     */
    public String generateToken(Long userId, String email, String role) {
        return generateToken(userId, email, role, null);
    }

    public String generateRefreshToken(Long userId) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + this.expiration * 7L);
        return Jwts.builder().setSubject(String.valueOf(userId)).setIssuedAt(now).setExpiration(expiryDate).signWith(this.key, SignatureAlgorithm.HS256).compact();
    }

    public Long getUserIdFromToken(String token) {
        Claims claims = (Claims) Jwts.parserBuilder().setSigningKey(this.key).build().parseClaimsJws(token).getBody();
        return Long.parseLong(claims.getSubject());
    }

    public String getRoleFromToken(String token) {
        Claims claims = (Claims) Jwts.parserBuilder().setSigningKey(this.key).build().parseClaimsJws(token).getBody();
        return claims.get("role", String.class);
    }

    public boolean validateToken(String token) throws ExpiredJwtException {
        try {
            Jwts.parserBuilder().setSigningKey(this.key).build().parseClaimsJws(token);
            return true;
        } catch (ExpiredJwtException e) {
            throw e;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
