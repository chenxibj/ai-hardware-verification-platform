package com.lab.baseline;

import com.lab.chipreport.ChipReport;
import com.lab.config.SecurityConfig;
import com.lab.config.JwtTokenProvider;
import com.lab.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * #541: Security tests for baseline API endpoints
 * Verifies:
 * - /baselines/coverage requires authentication (not permitAll)
 * - POST /reports/{id}/regenerate requires ADMIN or ENGINEER role
 */
@WebMvcTest(BaselineController.class)
@Import(SecurityConfig.class)
class BaselineSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private BaselineService baselineService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @MockBean
    private UserRepository userRepository;

    @BeforeEach
    void setUp() {
        // Mock service methods so authorized requests get clean 200 responses
        when(baselineService.getBaselineCoverage(null, null))
                .thenReturn(Map.of("baselineCoveredItems", 0));

        ChipReport mockReport = new ChipReport();
        mockReport.setId(1L);
        mockReport.setReportNo("RPT-TEST");
        mockReport.setPlanId(1L);
        mockReport.setChipId(1L);
        mockReport.setStatus(ChipReport.ReportStatus.DRAFT);
        when(baselineService.regenerateReport(anyLong())).thenReturn(mockReport);
    }

    // === /baselines/coverage should require authentication ===

    @Test
    @DisplayName("#541: GET /baselines/coverage without auth returns 401")
    void baselineCoverage_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/baselines/coverage"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("#541: GET /baselines/coverage with auth succeeds")
    @WithMockUser(username = "user", roles = {"engineer"})
    void baselineCoverage_authenticated_allowed() throws Exception {
        mockMvc.perform(get("/baselines/coverage"))
                .andExpect(status().isOk());
    }

    // === POST /reports/{id}/regenerate should require ADMIN or ENGINEER role ===

    @Test
    @DisplayName("#541: POST /reports/{id}/regenerate without auth returns 401")
    void regenerateReport_unauthenticated_returns401() throws Exception {
        mockMvc.perform(post("/reports/1/regenerate"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("#541: POST /reports/{id}/regenerate with viewer role returns 403")
    @WithMockUser(username = "viewer", roles = {"viewer"})
    void regenerateReport_viewer_returns403() throws Exception {
        mockMvc.perform(post("/reports/1/regenerate"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("#541: POST /reports/{id}/regenerate with engineer role allowed")
    @WithMockUser(username = "engineer", roles = {"engineer"})
    void regenerateReport_engineer_allowed() throws Exception {
        mockMvc.perform(post("/reports/1/regenerate"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("#541: POST /reports/{id}/regenerate with admin role allowed")
    @WithMockUser(username = "admin", roles = {"tenant_admin"})
    void regenerateReport_admin_allowed() throws Exception {
        mockMvc.perform(post("/reports/1/regenerate"))
                .andExpect(status().isOk());
    }
}
